'use client';
import * as React from 'react';
import type { ClassroomBlock, ClassroomStep } from '@study-agent/contracts';
import type { TeachingEditorDraft } from '../../../lib/teaching-editor-copy';
import { BoardStep } from '../../studio/classroom/board-step';
import '../../studio/classroom/classroom.css';
import './teaching-package-preview.css';

const purposes = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' };
const filled = (text: string) => text.trim() ? text : '尚未填写';

function Reading({ title, text, points = [], blocks = [] }: {
  title: string; text: string; points?: string[]; blocks?: ClassroomBlock[];
}) {
  const id = React.useId(), step: ClassroomStep = { id, title, phase: 'concept', narration: text, durationMs: 8000,
    blocks: [{ id: id + ':title', kind: 'heading', text: title }, { id: id + ':text', kind: 'text', text: filled(text) },
      ...(points.length ? [{ id: id + ':points', kind: 'points' as const, text: '', items: points.map(filled) }] : []), ...blocks] };
  return <section className="cl-board-step"><BoardStep step={step} sentence={0} full /></section>;
}

/** Private reading of the current draft. The classroom components only receive
 * authored teaching, never original source pages, answer catalogs or commands. */
export default function TeachingPackagePreview({ copy }: { copy: TeachingEditorDraft }) {
  const content = copy.content;
  return <div className="teaching-package-reading" role="region" aria-label="当前教学稿阅读预览">
    <p className="studio-hint">教研预览 · 显示当前编辑内容，包含预期观察与反馈。保存、审核和发布仍分别确认。</p>
    <h4>{filled(content.title)}</h4>
    <Reading title="本课目标与成功标准" text={content.goals.map(goal => filled(goal.objective) + '\n成功标准：' + filled(goal.successCriterion)).join('\n\n')} />
    {content.prerequisites.length > 0 && <Reading title="先修回顾" text={content.prerequisites.map(item => filled(item.rationale)).join('\n\n')} />}
    <Reading title="先观察，再联系" text={filled(content.activation.prompt) + '\n预期观察：' + filled(content.activation.expectedObservation) + '\n联系目标：' + filled(content.activation.bridge)} />
    <Reading title="完整概念讲解" text={content.concept.explanation} points={content.concept.points} />
    <Reading title="例题情境" text={content.example.situation} />
    {content.example.steps.map((step, index) => <Reading key={index} title={`例题 · 第${index + 1}步`} text={step.explanation} points={step.board} />)}
    <Reading title="例题结论与适用条件" text={content.example.conclusion} />
    {content.visuals.map((visual, index) => {
      const id = 'draft-visual:' + index;
      if (visual.kind === 'not_applicable') return <Reading key={index} title="表征选择与依据" text={visual.rationale} />;
      if (visual.kind === 'diagram') return <React.Fragment key={index}>
        <Reading title={filled(visual.diagram.title)} text={visual.explanation} blocks={[{ id, kind: 'diagram', text: visual.explanation, diagram: visual.diagram }]} />
        <ul className="teaching-package-diagram-labels" aria-label="图中完整标注">{visual.diagram.labels.map((label, position) => <li key={position}>{filled(label)}{visual.diagram.captions?.[position] && ' · ' + visual.diagram.captions[position]}</li>)}</ul>
      </React.Fragment>;
      if (visual.kind === 'table') return <Reading key={index} title={filled(visual.title)} text={visual.explanation}
        blocks={[{ id, kind: 'table', text: filled(visual.title), table: { headers: visual.headers, rows: visual.rows } }]} />;
      if (visual.kind === 'math') return <Reading key={index} title={filled(visual.figure.title)} text={visual.explanation}
        blocks={[{ id, kind: 'math', text: visual.explanation, math: visual.figure }]} />;
      return <Reading key={index} title={filled(visual.experiment.title)} text="先预测，再观察和解释。可在下方操作课堂模型。"
        blocks={[{ id, kind: 'experiment', text: '', experiment: visual.experiment }]} />;
    })}
    {content.misconceptions.map((item, index) => <Reading key={index} title={`错因与替代解释 · ${index + 1}`}
      text={'观察：' + filled(item.observation) + '\n替代解释：' + item.alternatives.map(filled).join('；') + '\n区分方法：' + filled(item.verification) + '\n纠正反馈：' + filled(item.correctiveFeedback)} />)}
    <Reading title="检查安排" text={content.checks.map((check, index) => `${index + 1}. ${purposes[check.purpose]}：${filled(check.instructions)}\n已选${check.materials.length}份材料`).join('\n\n')} />
    <Reading title="换一个情境" text={filled(content.transfer.scenario) + '\n任务：' + filled(content.transfer.prompt) + '\n预期策略：' + filled(content.transfer.expectedStrategy)} />
    <Reading title="总结与回顾" text={content.summary.synthesis} points={content.summary.takeaways} />
    <Reading title="之后再用新题核查" text={filled(content.retention.instructions) + '\n间隔安排：' + content.retention.intervalDays.join('、') + '日，从最后一次相关教学或帮助起算。'} />
  </div>;
}
