import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AssistantWhiteboardAudience, TopicWhiteboardAudience, TopicWhiteboardInput } from '@study-agent/contracts';
import type { InMemoryAuthSession, InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';
import { topicWhiteboardDigest, topicWhiteboardVersion, type PreparedTopicWhiteboard, type PreparedFreeTopicWhiteboard, type TopicWhiteboardTarget } from './topic-whiteboard-content';
import type { TopicWhiteboardAuthorization, TopicWhiteboardDraftRecord } from './topic-whiteboard-record';
import type { TopicWhiteboardSourceAccess } from './topic-whiteboard-source-access';

/** All asynchronous callers must enter a new transaction before using this snapshot. */
export function captureTopicWhiteboardAuthorization(store: InMemoryStoreService, students: StudentsService,
  user: InMemoryUserAccount, audience: TopicWhiteboardAudience | AssistantWhiteboardAudience, session: InMemoryAuthSession,
  prepared?: PreparedTopicWhiteboard, source?: TopicWhiteboardSourceAccess): TopicWhiteboardAuthorization {
  if (prepared && !['topic-whiteboard-v1', 'assistant-topic-whiteboard-v1'].includes(prepared.version)) throw new ForbiddenException('未知的白板来源协议');
  if (audience.kind === 'assistant') {
    if (!source || prepared?.version !== 'assistant-topic-whiteboard-v1') throw new ForbiddenException('原对话白板需要完整来源授权');
    return source.capture(user, prepared, session);
  }
  if (prepared?.version === 'assistant-topic-whiteboard-v1') throw new ForbiddenException('原白板来源协议与受众不一致');
  return captureWhiteboardActorAuthorization(store, students, user, audience.kind === 'adult' ? null : audience.studentId, session);
}

/** Login and learner binding only. Teaching scope and private origin are checked by the protocol adapter. */
export function captureWhiteboardActorAuthorization(store: InMemoryStoreService, students: StudentsService,
  user: InMemoryUserAccount, studentId: string | null, session: InMemoryAuthSession): TopicWhiteboardAuthorization {
  const current = session?.tokenHash && store.find('sessions', { tokenHash: session.tokenHash, userId: user.id });
  if (!current || current.revokedAt || !Number.isFinite(Date.parse(current.expiresAt)) || Date.parse(current.expiresAt) <= Date.now())
    throw new UnauthorizedException('原登录已失效，请重新登录');
  const actor = store.find('users', { id: user.id, status: 'active', role: user.role });
  if (!actor) throw new ForbiddenException('原白板身份已变化');
  const authorization: TopicWhiteboardAuthorization = { role: actor.role, sessionTokenHash: current.tokenHash };
  if (studentId === null) {
    if (actor.role === 'student') throw new ForbiddenException('学习入口只能生成自己的孩子白板');
    return authorization;
  }
  students.assertCanAccessStudent(actor, studentId);
  if (actor.role === 'admin') return authorization;
  let guardianId = actor.id;
  if (actor.role === 'student') {
    const access = store.find('studentLearningAccess', { studentId, userId: actor.id,
      status: 'enabled', version: current.accessVersion });
    const guardian = store.find('users', { id: current.guardianId, status: 'active', role: ['parent', 'admin'] });
    if (current.studentId !== studentId || !access || !guardian)
      throw new UnauthorizedException('原学习权限已变化，请重新进入');
    Object.assign(authorization, { guardianId: guardian.id, accessId: access.id, accessVersion: access.version });
    if (guardian.role === 'admin') return authorization;
    guardianId = guardian.id;
  }
  const binding = store.find('bindings', { studentId, parentUserId: guardianId, status: 'active' });
  if (!binding) throw new ForbiddenException('原监护关系已变化');
  return { ...authorization, bindingId: binding.id, bindingHash: topicWhiteboardDigest(binding) };
}

/** Freeze only explicitly selected goals and approved teaching; no family evidence enters the model context. */
export function prepareTopicWhiteboard(store: InMemoryStoreService, students: StudentsService, user: InMemoryUserAccount,
  input: TopicWhiteboardInput, model: { id: string; label: string }): PreparedFreeTopicWhiteboard {
  const normalized: TopicWhiteboardInput = { ...structuredClone(input), modelId: model.id };
  let grade: number | null = null, scopeFingerprint: string | null = null;
  const targets: TopicWhiteboardTarget[] = [];
  const audience = normalized.audience;
  if (audience.kind === 'adult') {
    if (user.role === 'student') throw new ForbiddenException('学习入口只能生成自己的孩子白板');
  } else {
    students.assertCanAccessStudent(user, audience.studentId);
    const scope = store.select('learningScopes', { studentId: audience.studentId, subject: audience.subject })
      .sort((a, b) => b.version - a.version)[0];
    if (!scope?.confirmedAt) throw new BadRequestException('请先确认当前年级和已学范围');
    grade = scope.grade;
    scopeFingerprint = topicWhiteboardDigest(scope);
    for (const id of audience.atomIds) {
      const atom = store.find('knowledgeAtoms', { id, subject: audience.subject, status: 'published' });
      if (!scope.learnedAtomIds.includes(id) || !atom || atom.grade !== grade || ![scope.term, 'both'].includes(atom.term))
        throw new BadRequestException('所选知识点不在当前已确认范围');
      const teaching = atom.teaching?.reviewStatus === 'approved' ? atom.teaching : undefined;
      targets.push({ id: atom.id, name: atom.name, objective: atom.objective, definitionFingerprint: atomDefinitionFingerprint(atom),
        ...(teaching ? { teaching: { explanation: teaching.explanation, example: structuredClone(teaching.example) } } : {}) });
    }
  }
  const context = JSON.stringify({ version: topicWhiteboardVersion, audience: audience.kind, grade,
    subject: audience.kind === 'student' ? audience.subject : null, topic: normalized.prompt, objective: normalized.objective,
    targets, sourceStatus: audience.kind === 'adult' ? 'AI候选，无已核对的教材来源' : '仅所选已确认目标；教学卡不等于生成稿已审核' });
  if (context.length > 18000) throw new BadRequestException('所选讲解内容过长，请减少知识点后重新预检');
  const identity = { version: topicWhiteboardVersion, input: normalized, modelId: model.id, modelName: model.label,
    grade, scopeFingerprint, targets, context };
  return { ...identity, fingerprint: topicWhiteboardDigest(identity) };
}

export function assertTopicWhiteboardInputCurrent(store: InMemoryStoreService, students: StudentsService,
  user: InMemoryUserAccount, prepared: PreparedTopicWhiteboard, source?: TopicWhiteboardSourceAccess) {
  if (prepared.version === 'assistant-topic-whiteboard-v1') {
    if (!source) throw new ForbiddenException('原对话白板需要完整来源授权');
    return source.assertCurrent(user, prepared);
  }
  if (prepared.version !== topicWhiteboardVersion) throw new ForbiddenException('未知的白板来源协议');
  const { fingerprint, ...identity } = prepared;
  const current = prepareTopicWhiteboard(store, students, user, prepared.input, { id: prepared.modelId, label: prepared.modelName });
  if (topicWhiteboardDigest(identity) !== fingerprint || current.fingerprint !== fingerprint)
    throw new ConflictException('原范围、目标或教学卡已变化，请保留旧稿并准备当前版本');
}

export function topicWhiteboardAuthority(store: InMemoryStoreService, students: StudentsService, row: TopicWhiteboardDraftRecord, source?: TopicWhiteboardSourceAccess) {
  const auth = row.authorization;
  const user = store.find('users', { id: row.ownerUserId, role: auth.role, status: 'active' });
  const session = store.find('sessions', { userId: row.ownerUserId, tokenHash: auth.sessionTokenHash });
  if (!user || !session) throw new ForbiddenException('原白板授权已变化');
  const current = captureTopicWhiteboardAuthorization(store, students, user, row.prepared.input.audience, session, row.prepared, source);
  if (topicWhiteboardDigest(current) !== topicWhiteboardDigest(auth)) throw new ForbiddenException('原白板授权已撤回');
  assertTopicWhiteboardInputCurrent(store, students, user, row.prepared, source);
  return user;
}
