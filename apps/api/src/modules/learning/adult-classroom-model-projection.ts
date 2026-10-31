import type { ClassroomLesson, ClassroomStep } from '@study-agent/contracts';
import { adultClassroomModels } from './adult-classroom-models';

function modelStep(lessonId: string, suffix: string, phase: ClassroomStep['phase'], title: string, narration: string,
  blocks: ClassroomStep['blocks']): ClassroomStep {
  const id = lessonId + ':model-' + suffix;
  return { id, phase, title, narration, durationMs: Math.max(5500, narration.length * 165),
    blocks: [{ id: id + ':heading', kind: 'heading', text: title }, ...blocks.map((block, index) => ({ ...block, id: id + ':block:' + index }))] };
}

/** Only the fixed authored adult builder calls this; historical session snapshots are never rewritten. */
export function applyAdultClassroomModel(lesson: ClassroomLesson): void {
  if (lesson.id === 'soc-1-1-1') return;
  const model = adultClassroomModels[lesson.id];
  if (!model) throw new Error('成人微课缺少对应概念模型：' + lesson.id);
  const conceptIndex = lesson.steps.findIndex(step => step.id === lesson.id + ':concept');
  const contrast = lesson.steps.find(step => step.id === lesson.id + ':contrast');
  const concept = lesson.steps[conceptIndex];
  if (!concept || !contrast || lesson.steps.some(step => step.id.startsWith(lesson.id + ':model-')) ||
    concept.blocks.filter(block => block.kind === 'diagram' && block.diagram?.kind === 'flow' && block.diagram.title === '从观察走向可以核查的解释').length !== 1)
    throw new Error('成人微课原概念与误区步骤不一致：' + lesson.id);
  concept.blocks = concept.blocks.filter(block => !(block.kind === 'diagram' && block.diagram?.kind === 'flow'));
  const prediction = modelStep(lesson.id, 'predict', 'example', '先作一个判断', model.prediction,
    [{ id: '', kind: 'points', text: '先作一个判断', items: [model.prediction] }]);
  const reading = modelStep(lesson.id, 'reading', 'example', '阅读情境与概念模型', '以下是自编教学情境，不是真实调查结果。' + model.setting + model.reading,
    [{ id: '', kind: 'text', text: '自编教学情境：' + model.setting },
      { id: '', kind: 'table', text: lesson.title + ' · 概念对照', table: structuredClone(model.table) },
      { id: '', kind: 'text', text: model.reading }]);
  const evidence = modelStep(lesson.id, 'evidence', 'contrast', '比较解释与证据边界', model.alternative + model.nextEvidence + model.limit,
    [{ id: '', kind: 'points', text: '继续核查', items: ['替代解释：' + model.alternative, '下一步证据：' + model.nextEvidence, '目前不能推出：' + model.limit] }]);
  lesson.steps.splice(conceptIndex + 1, 0, prediction, reading);
  lesson.steps.splice(lesson.steps.indexOf(contrast) + 1, 0, evidence);
}
