import { createHash } from 'node:crypto';
import type { KnowledgeAtom, StudioSourceMaterial, StudioWhiteboard, StudioWhiteboardScene } from '@study-agent/contracts';

function excerpt(value: string, max = 520) { return value.replace(/\s+/g, ' ').trim().slice(0, max); }

export function buildPdfWhiteboard(input: { id: string; material: StudioSourceMaterial; atom?: KnowledgeAtom | null; now?: string }): StudioWhiteboard {
  const now = input.now ?? new Date().toISOString();
  const pages = input.material.pages.filter(page => excerpt(page.text).length > 20).slice(0, 8);
  if (!pages.length) throw new Error('PDF 中没有可讲解的文本页，请先完成文字识别后再试');
  const title = input.atom ? input.material.title + ' · ' + input.atom.name : input.material.title;
  const scenes: Omit<StudioWhiteboardScene, 'id'>[] = [{ kind: 'title', title,
    body: '从《' + input.material.title + '》中逐页核对材料，共 ' + input.material.pageCount + ' 页。',
    narration: '现在开始逐页讲解《' + input.material.title + '》。先看材料怎样呈现，再联系' + (input.atom?.name ?? '当前知识点') + '。', durationMs: 3600 }];
  for (const page of pages) {
    const text = excerpt(page.text, 760);
    scenes.push({ kind: 'pdf_page', title: '第 ' + page.page + ' 页', body: text,
      narration: '第 ' + page.page + ' 页写道：' + excerpt(text, 260) + '。请先找出条件和目标，再判断这一步与' + (input.atom?.name ?? '当前知识点') + '的关系。',
      source: { materialId: input.material.id, page: page.page, label: input.material.title + ' · 第 ' + page.page + ' 页' }, durationMs: 5600 });
  }
  scenes.push({ kind: 'check', title: '用自己的话核对', body: input.atom?.successCriterion ?? '关掉材料，说出本页最关键的条件、步骤和结果。',
    narration: '看完材料不等于掌握。现在收起页面，用自己的话复述关键关系，再用一道不同结构的新题检查是否真的理解。',
    bullets: ['不看原文说出目标与条件。', '独立完成一个不同结构的新题。', '记录提示、错误步骤与是否能够迁移。'], durationMs: 4800 });
  const complete = scenes.map((scene, index) => ({ id: 'scene:' + (index + 1), ...scene }));
  const durationMs = complete.reduce((sum, scene) => sum + scene.durationMs, 0);
  const fingerprint = createHash('sha256').update(JSON.stringify({ materialId: input.material.id, sha256: input.material.sha256,
    atomId: input.atom?.id ?? null, pages: pages.map(page => [page.page, excerpt(page.text)]), scenes: complete })).digest('hex');
  return { id: input.id, studentId: input.material.studentId, subject: input.material.subject, atomId: input.atom?.id ?? null,
    sourceMaterialId: input.material.id, title, prompt: '逐页讲解 ' + input.material.title, scenes: complete, durationMs,
    width: 1280, height: 720, fingerprint, createdAt: now, updatedAt: now };
}
