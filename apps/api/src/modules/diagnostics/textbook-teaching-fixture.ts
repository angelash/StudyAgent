/** Explicitly synthetic, original fixtures for package protocol tests. No learner
 * sessions, answers, simulated dates or textbook originals are created here. */
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { KnowledgeAtom, MeasurementDimension, TextbookTeachingSave } from '@study-agent/contracts';
import { atomDefinitionFingerprint, questionContentFingerprint } from './measurement-definition';
import { makeTeachingSourceSnapshot, teachingHash, teachingSourceDescriptor, teachingTextHash } from './textbook-teaching-package';

export function teachingFixture(targetCount = 1) {
  const store = new InMemoryStoreService(), privateText = '私有教材核对文字：此处以合成数量关系说明如何区分目标、例题与独立检查，不属于真实教材正文。';
  const source = makeTeachingSourceSnapshot({ bookId: 'qa:teaching:book', bookVersion: 'qa-v1', lessonId: 'qa:teaching:lesson',
    sourceBookId: 'qa:teaching:source', sourceSha256: 'a'.repeat(64), extractedSha256: 'b'.repeat(64), lessonFingerprint: 'c'.repeat(64),
    pageStart: 2, pageEnd: 3, bookTitle: '合成教学协议材料', edition: '工程合成第一版', lessonName: '数量关系核查', subject: 'math', grade: 3, term: 'upper', sourcePages: 5,
    pages: [2, 3].map(page => ({ page, text: privateText, textCharacters: [...privateText].length, textSha256: teachingTextHash(privateText) })) });
  const atoms: KnowledgeAtom[] = Array.from({ length: targetCount }, (_, index) => ({ id: 'qa:teaching:atom:' + index, version: 1, subject: 'math', grade: 3, term: 'both',
    name: '数量关系' + (index + 1), strand: '数与运算', curriculumVersion: 'qa-original-v1', objective: '根据数量关系独立解释合成情境中的已知与未知',
    successCriterion: '独立完成新题并说明选择这种数量关系的依据', prerequisiteIds: [], status: 'published' }));
  for (const atom of atoms) {
    store.append('knowledgeAtoms', atom);
    for (let n = 0; n < 20; n++) {
      const id = atom.id + ':question:' + n, dimension: MeasurementDimension = n < 4 ? ['understanding', 'procedure', 'transfer', 'transfer'][n] as MeasurementDimension :
        ['understanding', 'procedure', 'retention', 'retention'][(n - 4) % 4] as MeasurementDimension;
      store.append('questions', { id, subject: atom.subject, type: 'objective', stem: '合成工程题' + n + '，只用于验证材料选择', answer: n, analysis: '私有合成答案说明' + n,
        difficultyLevel: 1, knowledgePointIds: [atom.id], status: 'published' });
      store.append('questionAnswerSchemas', { questionId: id, mode: 'numeric_blank', responseShape: {}, validationRules: {}, gradingConfig: {} });
      store.append('questionSources', { questionId: id, sourceType: 'internal_authoring', sourceName: '合成工程夹具', sourcePathOrUrl: 'qa:original', licenseClass: 'A_INTERNAL',
        licenseName: null, importJobId: null, reviewStatus: 'approved', notes: '非教材，非学生记录' });
      store.append('measurementItems', { id: id + ':mapping', questionId: id, questionVersion: 1, atomId: atom.id, dimension, family: id + ':family', expectedSeconds: 60,
        difficulty: 1, probeRole: dimension === 'retention' ? 'retention' : dimension === 'transfer' ? 'transfer' : 'anchor', reviewStatus: 'approved', mappingWeight: 1,
        observationCode: 'synthetic', version: 1, atomDefinitionFingerprint: atomDefinitionFingerprint(atom), contentFingerprint: questionContentFingerprint(store, id) });
    }
  }
  const refs = (atomId: string, purpose: string) => store.select('measurementItems', { atomId }).filter(item => purpose === 'retention' ? +item.questionId.split(':').at(-1)! >= 4 :
    +item.questionId.split(':').at(-1)! < 4 && item.dimension === purpose).map(item => ({ measurementId: item.id, version: item.version, questionId: item.questionId,
      questionVersion: item.questionVersion, definitionFingerprint: atomDefinitionFingerprint(atoms.find(atom => atom.id === atomId)!), contentFingerprint: questionContentFingerprint(store, item.questionId) }));
  const input: TextbookTeachingSave = { packageId: 'qa:teaching:package', requestKey: 'qa-teaching-save-0001', expectedRevision: 0, action: 'save', basedOn: null, source: teachingSourceDescriptor(source),
    sourceFingerprint: source.fingerprint, targetRefs: atoms.map(atom => ({ atomId: atom.id, version: atom.version, definitionFingerprint: atomDefinitionFingerprint(atom) })),
    sourceReview: { confirmedRange: true, statement: '完整读取两页合成文字，仅确认工程范围；此记录不能作为真实教材审核或教师结论。',
      pages: [2, 3].map(page => ({ page, visualChecked: true, statement: '此页属于合成协议夹具，无真实教材图示或公式，不能作为教材审核结论。' })) },
    content: { title: '合成数量关系完整稿', goals: atoms.map((atom, index) => ({ id: 'goal-' + index, atomId: atom.id, objective: atom.objective, successCriterion: atom.successCriterion })),
      prerequisites: [], activation: { prompt: '先观察合成情境中两组数量分别表示什么。', expectedObservation: '指出总数量和每组数量之间的对应关系。', bridge: '把观察到的对应关系联系到本课数量关系目标。' },
      concept: { explanation: '先明确每个数量所表示的意义，再根据情境确定总量与部分之间的关系。独立检查时需要换用新的情境，不能只复述例题答案。', points: ['明确数量含义', '写出关系并核对适用条件'] },
      example: { situation: '有两组合成纸片，先记录每组数量，再观察合起来的总数。', steps: [{ explanation: '先分别数出每组的数量并说明单位。', board: ['第一组数量', '第二组数量'] },
        { explanation: '把两组数量合在一起，说明为什么使用加法。', board: ['部分与总量关系'] }], conclusion: '合起来的总量等于两组数量之和，结论依赖数量单位一致。' },
      visuals: [{ kind: 'table', title: '两组与总量', headers: ['项目', '数量'], rows: [['第一组', '2'], ['第二组', '3'], ['合起来', '5']], explanation: '表格把项目和数量对应列出，便于核对单位和总量关系。' }],
      misconceptions: [{ observation: '把其中一组数量直接当成合起来的总量。', alternatives: ['可能漏看另一组，也可能还未区分部分与总量。'], verification: '换一个数量情境，请先指出两组再解释总量关系。', correctiveFeedback: '先把每个部分完整列出，再检查总量是否包含两个部分。' }],
      checks: atoms.flatMap((atom, index) => (['understanding', 'procedure', 'transfer', 'retention'] as const).map(purpose => ({ id: 'check-' + index + '-' + purpose,
        atomId: atom.id, purpose, instructions: '独立完成新的数量关系任务，再说明自己的依据；需要帮助时单独记录。', materials: refs(atom.id, purpose) }))),
      transfer: { scenario: '换成不同颜色的书签，数量和呈现方式也发生变化。', prompt: '请先找出两个部分，再独立解释合成后的总量关系。', expectedStrategy: '先核对数量单位一致，再通过部分与总量关系判断。' },
      summary: { synthesis: '解释数量关系时，先确认各个数量代表什么，再根据情境选择合适的关系。', takeaways: ['先核对单位和数量含义', '换情境后仍需要独立说明依据'] },
      retention: { intervalDays: [1, 3, 7, 14], anchor: 'last_relevant_teaching_or_help', instructions: '后续在真实间隔到期后使用未见过的新题核查；若使用帮助则重新核对保持锚点，不把工程材料储备算作学习结果。' },
      citations: [{ page: 2, quote: '此处以合成数量关系说明如何区分目标', usedFor: 'concept' }] } };
  return { store, source, input, atoms, privateText, stateHash: () => teachingHash({ atoms: store.inspect('knowledgeAtoms'), questions: store.inspect('questions'), mappings: store.inspect('measurementItems') }) };
}
