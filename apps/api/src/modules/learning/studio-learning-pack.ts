import { createHash } from 'node:crypto';
import type { KnowledgeAtom, MasteryEstimate, StudioLearningCitation, StudioLearningPackPreview,
  StudioSourceMaterial, StudioSubject } from '@study-agent/contracts';

type Input = {
  id: string;
  studentId: string;
  subject: StudioSubject;
  title?: string;
  atoms: KnowledgeAtom[];
  estimates: MasteryEstimate[];
  focusAtomIds?: string[];
  material?: StudioSourceMaterial | null;
  now?: string;
};

const priority: Record<MasteryEstimate['status'], number> = {
  fragile: 0, learning: 1, insufficient: 2, unknown: 2, secure: 3,
};
const clean = (value: string, max = 1200) => value.replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);

function pageForAtom(atom: KnowledgeAtom, material?: StudioSourceMaterial | null) {
  if (!material) return undefined;
  return material.pages.map(page => {
    const text = page.text.toLocaleLowerCase('zh-CN');
    const name = atom.name.toLocaleLowerCase('zh-CN');
    let score = text.includes(name) ? 20 : 0;
    for (let length = 2; length < name.length; length += 1) {
      for (let start = 0; start + length <= name.length; start += 1) {
        if (text.includes(name.slice(start, start + length))) score += length;
      }
    }
    return { page, score };
  }).sort((a, b) => b.score - a.score)[0]?.page;
}

export function buildStudioLearningPack(input: Input): StudioLearningPackPreview {
  const estimates = new Map(input.estimates.map(row => [row.atomId, row])), requested = new Set(input.focusAtomIds ?? []);
  const candidates = input.atoms.filter(atom => atom.teaching?.reviewStatus === 'approved' && (!requested.size || requested.has(atom.id)))
    .sort((a, b) => priority[estimates.get(a.id)?.status ?? 'unknown'] - priority[estimates.get(b.id)?.status ?? 'unknown'] ||
      (estimates.get(a.id)?.independentFamilies ?? 0) - (estimates.get(b.id)?.independentFamilies ?? 0));
  const atoms = candidates.slice(0, 4);
  if (!atoms.length) throw new Error('当前范围没有已审核教学依据的知识点，不能生成个性化材料');
  const now = input.now ?? new Date().toISOString();
  const citation = (atom: KnowledgeAtom): StudioLearningCitation[] => {
    const page = pageForAtom(atom, input.material);
    return [{ atomId: atom.id, atomName: atom.name, label: '已审核知识点 v' + atom.version + '：' + atom.objective,
      ...(input.material && page ? { materialId: input.material.id, page: page.page } : {}) }];
  };
  const sections = atoms.flatMap(atom => {
    const teaching = atom.teaching!;
    return [
      { id: 'section:' + atom.id + ':explain', kind: 'explain' as const, title: '先用自己的话建立关系', body: clean(teaching.explanation),
        bullets: ['不看原文，说出题目在比较或改变了什么。', '指出一个最容易混淆的步骤，并说明为什么。'], citations: citation(atom) },
      { id: 'section:' + atom.id + ':example', kind: 'example' as const, title: '跟着已审核例子走一遍', body: clean(teaching.example.prompt),
        bullets: teaching.example.steps.map(clean).concat('结论：' + teaching.example.conclusion), citations: citation(atom) },
      { id: 'section:' + atom.id + ':misconception', kind: 'misconception' as const, title: '把易错点变成可验证假设',
        body: teaching.commonErrors.map(error => error.observation).join('；'),
        bullets: teaching.commonErrors.flatMap(error => error.alternativeExplanations.map(item => '其他解释：' + item)
          .concat('验证动作：' + error.verification)).slice(0, 5), citations: citation(atom) },
      { id: 'section:' + atom.id + ':transfer', kind: 'transfer' as const, title: '换一个情境再检查', body: atom.successCriterion,
        bullets: ['使用新题，避免只看已经做过的例子。', '记录独立完成、提示次数和卡住的位置。', '隔一段时间再次复测，不能以当天一次正确代替保持。'],
        citations: citation(atom) },
    ];
  });
  const flashcards = atoms.flatMap(atom => {
    const teaching = atom.teaching!, cite = citation(atom);
    return [
      { id: 'card:' + atom.id + ':core', prompt: '不看讲义，解释“' + atom.name + '”的关键关系。', answer: teaching.explanation,
        hint: '先说题目中的量或单位怎样变化，再说最后怎样检查。', citations: cite },
      { id: 'card:' + atom.id + ':example', prompt: teaching.example.prompt, answer: teaching.example.steps.join(' → ') + '；' + teaching.example.conclusion,
        hint: '只提示下一步该比较或统一什么，不直接给最终答案。', citations: cite },
      { id: 'card:' + atom.id + ':error', prompt: '出现“' + teaching.commonErrors[0].observation + '”时，应该怎样验证？',
        answer: teaching.commonErrors[0].verification, hint: '用另一个表示方式或反向检查，而不重复原步骤。', citations: cite },
    ];
  });
  const practiceSteps = atoms.flatMap(atom => [{
    id: 'practice:' + atom.id + ':micro', title: '独立微测：' + atom.name,
    detail: '关闭讲义，完成一组不同结构的新题；先记录提示与错误步骤，再回看材料。', atomId: atom.id, minutes: 8,
  }]);
  practiceSteps.push({ id: 'practice:review-cycle', title: '安排延迟复测', atomId: atoms[0].id,
    detail: '按 D+1、D+3、D+7、D+14 使用新的变式题，比较准确率、独立性和保持情况。', minutes: 12 });
  const matchedPages = input.material ? atoms.filter(atom => pageForAtom(atom, input.material)).length : 0;
  const preview: StudioLearningPackPreview = {
    id: input.id, studentId: input.studentId, subject: input.subject,
    title: clean(input.title || atoms.map(atom => atom.name).join(' × ') + ' · 个性化学案', 180),
    atomIds: atoms.map(atom => atom.id), sourceMaterialId: input.material?.id ?? null,
    sections, flashcards, practiceSteps, reviewDays: [1, 3, 7, 14], fingerprint: '',
    createdAt: now, updatedAt: now,
    warnings: [
      ...(!input.material ? ['未绑定 PDF；本学案只引用已审核知识定义与教学素材。'] : []),
      ...(input.material && matchedPages < atoms.length ? ['PDF 页码只作为人工对照来源；未自动命中的知识点不会伪造页码映射。'] : []),
      '闪卡、讲义和完成动作不会直接写入掌握度；仍需独立新题与延迟复测提供证据。',
    ],
  };
  preview.fingerprint = createHash('sha256').update(JSON.stringify({ studentId: preview.studentId, subject: preview.subject,
    atomIds: preview.atomIds, sourceMaterialId: preview.sourceMaterialId, materialSha: input.material?.sha256 ?? null,
    sections, flashcards, practiceSteps })).digest('hex');
  return preview;
}
