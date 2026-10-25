import { createHash } from 'node:crypto';
import type { KnowledgeAtom, StudioWhiteboard, StudioWhiteboardScene, TeachingVisual } from '@study-agent/contracts';

type WhiteboardInput = {
  id: string;
  studentId: string;
  subject: StudioWhiteboard['subject'];
  prompt: string;
  atom?: KnowledgeAtom | null;
  now?: string;
};

function clean(value: string, max: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sceneSuffix(_index: number, narration: string) {
  return narration;
}

export function buildStudioWhiteboard(input: WhiteboardInput): StudioWhiteboard {
  const now = input.now ?? new Date().toISOString();
  const prompt = clean(input.prompt, 2000), atom = input.atom;
  const title = clean(atom?.name || prompt || '自由白板讲解', 120);
  const teaching = atom?.teaching?.reviewStatus === 'approved' ? atom.teaching : undefined;
  const scenes: Omit<StudioWhiteboardScene, 'id'>[] = [
    {
      kind: 'title', title, narration: sceneSuffix(0, `这次我们从“${title}”开始，把关键关系拆成看得见的步骤。`),
      body: prompt || atom?.objective || '先确定目标，再观察每一步怎样变化。', durationMs: 3200,
    },
    {
      kind: 'concept', title: '先建立概念', narration: sceneSuffix(1, teaching?.explanation || atom?.objective || `先说清楚“${title}”要解决什么，以及哪一个整体保持不变。`),
      body: teaching?.explanation || atom?.objective || `围绕“${title}”先列出已知条件、目标与可用关系。`, durationMs: 5200,
    },
  ];
  if (teaching?.example) {
    scenes.push({
      kind: 'steps', title: '跟着步骤走', narration: sceneSuffix(scenes.length, `现在用“${teaching.example.prompt}”做一次示范。${teaching.example.steps.map(step => /[。！？!?]$/u.test(step.trim()) ? step : step + '。').join('')}${teaching.example.conclusion}`),
      body: teaching.example.prompt, bullets: teaching.example.steps, durationMs: 6200,
    });
  }
  const visual: TeachingVisual | undefined = teaching?.visual;
  if (visual?.kind === 'fraction_bars') {
    scenes.push({
      kind: 'fraction_bars', title: visual.title, narration: sceneSuffix(scenes.length, visual.note),
      visual, durationMs: 7200,
    });
  }
  scenes.push({
    kind: 'check', title: '换一道新题验证',
    narration: sceneSuffix(scenes.length, '看懂演示不等于掌握。收起画面后，要用不同数值的独立新题和延迟复测再核查。'),
    body: teaching?.example.conclusion || atom?.successCriterion || '请用自己的话复述关系，并在新情境中独立完成。',
    bullets: teaching ? [teaching.verification.understanding, teaching.verification.procedure, teaching.verification.transfer] :
      ['先说出目标与已知条件。', '独立完成一个不同结构的新题。', '记录提示、步骤与解释是否仍然保留。'], durationMs: 4800,
  });
  const complete = scenes.map((scene, index) => ({ id: `scene:${index + 1}`, ...scene }));
  const base = { studentId: input.studentId, subject: input.subject, atomId: atom?.id ?? null, title, prompt,
    scenes: complete, durationMs: complete.reduce((sum, scene) => sum + scene.durationMs, 0), width: 1280, height: 720 };
  const fingerprint = createHash('sha256').update(JSON.stringify({ atomId: atom?.id ?? null, atomVersion: atom?.version ?? null, prompt, scenes: complete })).digest('hex');
  return { id: input.id, ...base, fingerprint, createdAt: now, updatedAt: now };
}
