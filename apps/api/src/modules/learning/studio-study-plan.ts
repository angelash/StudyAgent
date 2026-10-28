import { createHash } from 'node:crypto';
import type { KnowledgeAtom, MasteryEstimate, StudioPlanSession, StudioStudyPlan, StudioStudyPlanPreview,
  StudioSubject } from '@study-agent/contracts';

type BuildPlanInput = {
  id: string; studentId: string; subject: StudioSubject; title?: string; goal: string;
  targetDate: string; firstSessionAt: string; minutesPerDay: number;
  atoms: KnowledgeAtom[]; estimates: MasteryEstimate[];
  existingEvents: Array<{ startsAt: string; endsAt: string }>; now?: string;
};

const priority: Record<MasteryEstimate['status'], number> = {
  fragile: 0, learning: 1, insufficient: 2, unknown: 2, secure: 3,
};
const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);

function overlaps(start: Date, end: Date, events: BuildPlanInput['existingEvents']) {
  return events.some(event => start < new Date(event.endsAt) && end > new Date(event.startsAt));
}
function kindAt(index: number): StudioPlanSession['kind'] {
  return (['learn', 'practice', 'transfer', 'review'] as const)[index % 4];
}
function titleFor(kind: StudioPlanSession['kind'], atom: KnowledgeAtom) {
  if (kind === 'learn') return `重新建立：${atom.name}`;
  if (kind === 'practice') return `独立练习：${atom.name}`;
  if (kind === 'transfer') return `换情境迁移：${atom.name}`;
  return `延迟检查：${atom.name}`;
}
function criterion(kind: StudioPlanSession['kind'], atom: KnowledgeAtom) {
  if (kind === 'learn') return `能用自己的话解释“${atom.name}”的关键关系，并指出一个常见错误。`;
  if (kind === 'practice') return '无提示完成至少两道同知识点的不同题，并记录卡住的一步。';
  if (kind === 'transfer') return '在换了呈现方式或情境的新题中独立完成，并说明为什么仍使用同一关系。';
  return '隔一段时间后用新题复测，保留准确率、提示和独立完成证据；看过讲解不计为掌握。';
}

export function buildStudioStudyPlan(input: BuildPlanInput): StudioStudyPlanPreview {
  const now = input.now ?? new Date().toISOString(), first = new Date(input.firstSessionAt);
  const target = new Date(`${input.targetDate.slice(0, 10)}T23:59:59.999Z`);
  if (!Number.isFinite(first.getTime())) throw new Error('首次学习时间无效');
  if (!Number.isFinite(target.getTime()) || target < first) throw new Error('目标日期需要晚于首次学习时间');
  const estimates = new Map(input.estimates.map(row => [row.atomId, row]));
  const atoms = [...input.atoms].filter(atom => estimates.has(atom.id)).sort((a, b) =>
    priority[estimates.get(a.id)!.status] - priority[estimates.get(b.id)!.status] ||
    estimates.get(a.id)!.independentFamilies - estimates.get(b.id)!.independentFamilies);
  if (!atoms.length) atoms.push(...input.atoms.slice(0, 1));
  if (!atoms.length) throw new Error('当前范围没有可用于计划的已发布知识点');
  const selected = atoms.slice(0, Math.min(4, atoms.length));
  const maxDays = Math.max(1, Math.min(14, Math.floor((target.getTime() - first.getTime()) / 86_400_000) + 1));
  const count = Math.min(12, Math.max(3, maxDays));
  const minutes = Math.max(10, Math.min(60, input.minutesPerDay));
  const sessions: StudioPlanSession[] = [];
  for (let day = 0; day <= maxDays + 14 && sessions.length < count; day += 1) {
    const start = new Date(first); start.setUTCDate(start.getUTCDate() + day);
    if (start > target) break;
    const end = new Date(start.getTime() + minutes * 60_000);
    if (overlaps(start, end, input.existingEvents)) continue;
    const atom = selected[sessions.length % selected.length], kind = kindAt(sessions.length);
    sessions.push({ id: `plan-session:${sessions.length + 1}`, index: sessions.length + 1,
      title: titleFor(kind, atom), kind, atomIds: [atom.id], objective: atom.objective,
      successCriterion: criterion(kind, atom), startsAt: start.toISOString(), endsAt: end.toISOString(),
      status: 'scheduled', calendarEventId: '', evidenceBasis: estimates.has(atom.id)
        ? `当前状态：${estimates.get(atom.id)!.status}；独立题族：${estimates.get(atom.id)!.independentFamilies}`
        : '来自已确认学习范围' });
  }
  if (!sessions.length) {
    const atom = selected[0], end = new Date(first.getTime() + minutes * 60_000);
    sessions.push({ id: 'plan-session:1', index: 1, title: titleFor('learn', atom), kind: 'learn',
      atomIds: [atom.id], objective: atom.objective, successCriterion: criterion('learn', atom),
      startsAt: first.toISOString(), endsAt: end.toISOString(), status: 'scheduled', calendarEventId: '',
      evidenceBasis: '目标时间内冲突较多，先保留一个明确起点' });
  }
  const plan: StudioStudyPlan = { id: input.id, studentId: input.studentId, subject: input.subject,
    title: clean(input.title || `到 ${input.targetDate.slice(0, 10)} 的${input.subject === 'math' ? '数学' : input.subject === 'chinese' ? '语文' : input.subject === 'chemistry' ? '化学' : '英语'}学习计划`, 180),
    goal: clean(input.goal, 1000), targetDate: input.targetDate.slice(0, 10), minutesPerDay: minutes,
    status: 'active', sessions, fingerprint: '', revision: 1, createdAt: now, updatedAt: now };
  plan.fingerprint = createHash('sha256').update(JSON.stringify({ studentId: input.studentId, subject: input.subject,
    goal: plan.goal, targetDate: plan.targetDate, minutesPerDay: minutes,
    atoms: selected.map(atom => [atom.id, atom.version]), sessions })).digest('hex');
  return { ...plan, warnings: [...(input.existingEvents.length ? ['已跳过与现有日程冲突的时段。'] : []),
    ...(input.atoms.length > selected.length ? [`本计划只聚焦 ${selected.length} 个优先点，其余已学点保留在后续评测中。`] : []),
    '计划完成只表示执行过任务；“掌握”仍需独立新题和延迟复测。'],
    evidence: selected.map(atom => ({ atomId: atom.id, atomName: atom.name, status: estimates.get(atom.id)?.status ?? 'unknown',
      reason: estimates.has(atom.id) ? `独立题族 ${estimates.get(atom.id)!.independentFamilies} 个` : '来自已确认范围' })) };
}
