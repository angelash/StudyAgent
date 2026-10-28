import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { assistantPracticePreflightSchema, type AssistantPracticePreflight, type LearningScope } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { assertCourseAssessmentAvailable } from '../ai/assistant-course-context';
import { CurriculumService, eligibleMeasurements } from '../diagnostics/curriculum.service';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from '../diagnostics/family-identity';
import { atomDefinitionFingerprint, questionContentFingerprint } from '../diagnostics/measurement-definition';
import { originalPaperExposure } from '../diagnostics/paper-exposure';
import { StudentsService } from '../students/students.service';
import { stableAssistantWhiteboardOrigin } from './assistant-whiteboard-source';
import { topicWhiteboardDigest as digest, topicWhiteboardSerialize as serialize } from './topic-whiteboard-digest';

/** Read-only source and reviewed coverage. Does not expose or reserve assessment items. */
@Injectable()
export class AssistantPracticePreflightService {
  constructor(private readonly store: InMemoryStoreService, private readonly artifacts: AssistantArtifactService,
    private readonly curriculum: CurriculumService, private readonly students: StudentsService) {}

  preflight(user: InMemoryUserAccount, sessionId: string, input: unknown): AssistantPracticePreflight {
    const command = validate(assistantPracticePreflightSchema, input);
    const { origin } = this.artifacts.readSource(user, sessionId, { kind: 'verbatim_note', selection: command.selection, objective: command.objective });
    const stable = stableAssistantWhiteboardOrigin(origin), sourceFingerprint = digest(stable);
    const historical = origin.course?.current === false || origin.lecture?.current === false;
    const sourceGrade = origin.teachingScope?.grade ?? null;
    let scope: LearningScope | null = null, blocked: AssistantPracticePreflight['blocked'];
    const audience: AssistantPracticePreflight['audience'] = { kind: command.audience.kind, studentId: null, subject: null,
      sourceGrade, profileGrade: null, scopeGrade: null, scopeVersion: null, scopeFingerprint: null, scopeHref: null };
    const coverage: AssistantPracticePreflight['coverage'] = [], identities: unknown[] = [];
    if (command.audience.kind === 'adult') {
      if (user.role === 'student' || origin.studentId) throw new ForbiddenException('学生原对话不能改成成人受众，请保留原孩子和范围');
    } else {
      const target = command.audience;
      this.students.assertCanAccessStudent(user, target.studentId);
      if (origin.studentId && origin.studentId !== target.studentId) throw new ForbiddenException('原对话不能转给另一孩子');
      if (!origin.studentId) this.students.assertGuardian(user, target.studentId);
      // Preparing a child's new practice cannot bypass their active assessment through a guardian account.
      assertCourseAssessmentAvailable(this.store, target.studentId, 'student');
      const profile = this.students.getProfile(user, target.studentId);
      scope = this.curriculum.getScope(user, target.studentId, target.subject);
      Object.assign(audience, { studentId: target.studentId, subject: target.subject, profileGrade: profile.grade,
        scopeGrade: scope?.grade ?? null, scopeVersion: scope?.version ?? null, scopeFingerprint: scope ? digest(scope) : null,
        scopeHref: '/student/assessment?studentId=' + encodeURIComponent(target.studentId) + '&subject=' + target.subject });
      if (!scope) blocked = { code: 'learning_scope_required', message: '请先确认这位孩子的年级、教材和已学范围，尚未选择练习题。' };
      else {
        if (origin.subject && origin.subject !== target.subject) blocked = { code: 'source_target_subject_mismatch', message: '原教学学科与所选练习范围不一致，请修正目标。' };
        else if (sourceGrade !== null && sourceGrade !== scope.grade) blocked = { code: 'source_target_grade_mismatch', message: '原教学年级与已确认练习范围不一致；学生档案年级仍单独保留。' };
        const atoms = target.targetAtomIds.map(id => {
          const atom = this.store.find('knowledgeAtoms', { id });
          if (!atom || atom.status !== 'published' || !scope!.learnedAtomIds.includes(id) || atom.subject !== scope!.subject || atom.grade > scope!.grade
            || atom.grade === scope!.grade && scope!.term === 'upper' && atom.term === 'lower')
            throw new BadRequestException('练习目标超出本人已确认学习进度，请修正知识点选择');
          return atom;
        });
        const seen = new Set([...this.store.select('diagnosticSessions', { studentId: target.studentId }).flatMap(row => row.questionSnapshots.map(q => q.id)),
          ...this.store.select('practiceSessions', { studentId: target.studentId }).flatMap(row => row.questionIds), ...originalPaperExposure(this.store, target.studentId)]);
        for (const atom of atoms) {
          const mappings = eligibleMeasurements(this.store, [atom.id]).sort((a, b) => a.id.localeCompare(b.id));
          const families = new Map<string, Set<string>>();
          for (const item of mappings) {
            const identitiesForQuestion = families.get(item.questionId) ?? new Set<string>(); identitiesForQuestion.add(canonicalFamily(item)); families.set(item.questionId, identitiesForQuestion);
            identities.push({ id: item.id, questionId: item.questionId, questionVersion: item.questionVersion, mapping: digest(item),
              content: questionContentFingerprint(this.store, item.questionId), family: canonicalFamily(item), seen: seen.has(item.questionId) });
          }
          const historicalItems = this.store.select('diagnosticSessions', { studentId: target.studentId })
            .flatMap(row => row.itemSnapshots ?? []).filter(item => item.atomId === atom.id && seen.has(item.questionId));
          // Withdrawal/replacement does not erase a structure the learner already saw.
          const seenFamilies = new Set([...this.store.select('measurementItems', { atomId: atom.id }), ...historicalItems]
            .filter(item => seen.has(item.questionId)).map(canonicalFamily));
          const unambiguous = [...families].filter(([, values]) => values.size === 1);
          const unseen = unambiguous.filter(([id]) => !seen.has(id));
          coverage.push({ atomId: atom.id, name: atom.name, objective: atom.objective, definitionFingerprint: atomDefinitionFingerprint(atom),
            eligibleQuestionCount: families.size, ambiguousQuestionCount: families.size - unambiguous.length,
            seenQuestionCount: [...families.keys()].filter(id => seen.has(id)).length, unseenQuestionCount: unseen.length,
            unseenFamilyCount: new Set(unseen.flatMap(([, values]) => [...values]).filter(family => !seenFamilies.has(family))).size });
        }
        if (!blocked && coverage.some(row => row.unseenFamilyCount < 2)) blocked = { code: 'practice_coverage_gap', message: '部分知识点缺少两种未曝光的已审核题型结构，请先核对教研覆盖；没有自动补题。' };
      }
      if (!blocked && !origin.studentId && !command.acknowledgeAudienceTransfer)
        blocked = { code: 'audience_transfer_confirmation_required', message: '这段解释原来未绑定孩子，请明确核对目标孩子与教学范围。' };
    }
    const contextCharacters = serialize({ protocol: 'assistant-practice-preflight-v1', objective: command.objective, origin, audience, coverage }).length;
    const fits = contextCharacters <= 18000;
    if (!fits) blocked = { code: 'source_budget_exceeded', message: '完整来源和目标摘要超过18000字符，请减少原消息；全文与选择保持，尚未生成练习。' };
    else if (historical && !command.acknowledgeHistoricalSource) blocked = { code: 'historical_source_confirmation_required', message: '请先核对原教学版本并明确允许旧来源，不会恢复旧对话发送资格。' };
    return { protocol: 'assistant-practice-preflight-v1', origin, objective: command.objective, sourceFingerprint, historical, audience, coverage,
      fingerprint: digest({ protocol: 'assistant-practice-preflight-v1', command, source: stable, historical, audience, coverage, identities, familyVersion: FAMILY_IDENTITY_VERSION }),
      contextCharacters, maxContextCharacters: 18000, fits, canPrepareTeachingPractice: !blocked,
      isTeachingOnly: true, formalEvidenceCreated: false, creationAvailable: false, ...(blocked ? { blocked } : {}) };
  }
}
