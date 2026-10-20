import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
const names = ['小禾', '小林', '小雨', '小文', '小宁', '小安', '小川', '小贝', '小晴', '小乐', '小星', '小满'];
const places = ['图书馆', '花园', '教室', '庭院的桌边', '厨房', '窗台', '活动室', '门厅', '树荫下', '书房', '走廊', '阳台'];
const actions = ['整理图书', '给花浇水', '擦黑板', '摆正椅子', '洗水果', '擦花盆', '收画笔', '贴标签', '读故事', '找地图', '系鞋带', '叠毛巾'];
const objects = ['图书', '花盆', '黑板', '椅子', '水果', '窗台', '画笔', '分类标签', '故事书', '地图', '鞋带', '毛巾'];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const rubric = [
  { criterion: '说清题目要求的人物或对象、地点和动作，关键内容与材料一致', weight: 0.4 },
  { criterion: '用完整连贯的口语句子表达；允许自然停顿和合理自我修正', weight: 0.3 },
  { criterion: '录音中的关键内容可听清；不因口音差异扣分', weight: 0.3 },
];
const task = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`,
  answer, mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric, analysis, ...(blocks ? { blocks } : {}) });
const row = (n: number) => ({ name: names[n], place: places[n], action: actions[n], object: objects[n] });

/** Oral production only. Synthetic transport QA cannot certify speech quality, content or classroom usability. */
export function buildChineseOralGrade1ProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    seconds: number, make: (index: number) => Task) => result.push({ atomId: 'core:chinese:oral-complete', family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => ({ ...make(n), family, dimension, identityVersion: 2, expectedSeconds: seconds })) });

  add('oral-source-clear', 'procedure', '根据一段纯文字情景清楚说出人物与动作',
    '人物+地点+动作记录 → 用完整口语句子表达', '直接说出指定情景；不要求逐字复述记录，但关键信息必须对应。', 100, n => {
      const current = row(n);
      return task(`录音情景记录写着：“${current.name}在${current.place}${current.action}。”请说一到两句完整的话，清楚交代人物、地点和动作。`,
        `${current.name}在${current.place}${current.action}。`, '量规核对口头表达中的人物、地点、动作是否完整，语句是否连贯，以及关键表达能否听清；不评价特定口音。');
    });
  add('oral-personal-cards', 'procedure', '使用信息卡组织自己的完整口头说明',
    '人物+地点+动作三张信息卡 → 自主措辞完成口头表达', '信息卡提供内容，不提供可背诵整句；允许自然同义表达。', 110, n => {
      const current = row(n);
      return task('根据三张信息卡说一句或两句完整的话，讲清谁在哪里做什么。可以使用自己的自然说法。',
        `${current.name}在${current.place}${current.action}。`, '信息卡只约束口头说明内容。量规接受顺序和措辞合理变化，不按参考句逐字匹配。',
        [table(['信息卡', '内容'], [['人物', current.name], ['地点', current.place], ['动作', current.action]])]);
    });
  add('oral-repair-expression', 'transfer', '纠正残缺表达后重新完整说出情景',
    '残缺词串与必须补清的条件 → 口头重组完整表达', '需要依据残缺记录主动补全，不是复述一条完整参考句；额外阅读负担仍是替代解释。', 120, n => {
      const current = row(n), forms = [`${current.name}和${current.action}`, `在${current.place}${current.action}`, `${current.action}。`], fragment = forms[n % 3];
      return task(`一份口头提纲不完整，只写了“${fragment}”。请不要只重复提纲，把它说成一句或两句完整的话，清楚交代${current.name}、${current.place}和${current.action}。`,
        `${current.name}在${current.place}${current.action}。`, '先识别提纲缺失的人物、地点或动作，再独立组织口头语言。量规接受合理语序，不把一次综合失误确定成记忆或语言组织根因。',
        [table(['残缺提纲', '需要保留的条件'], [[fragment, `${current.name}；${current.place}；${current.action}`]])]);
    });
  add('oral-current-update', 'transfer', '只依据最新事件说出当前情景',
    '旧情景与最新更新 → 排除旧内容 → 完整口头表达当前情景', '旧记录提供反例，最终表达必须使用更新后的人物、地点或动作；不是简单同义复述。', 120, n => {
      const current = row(n), old = row((n + 5) % names.length);
      return task(`记录原先写“${old.name}在${old.place}${old.action}”，随后明确更新为“${current.name}在${current.place}${current.action}”。请按最新事件说一句完整的话，不要保留旧内容。`,
        `${current.name}在${current.place}${current.action}。`, '只核对更新后的当前口头事件。若仍保留旧人物、地点或动作，对应内容条件不达标；不能由本复合任务单独判断记录追踪、阅读或口语根因。',
        [table(['版本', '事件'], [['原记录（已更新）', `${old.name}在${old.place}${old.action}`], ['最新事件', `${current.name}在${current.place}${current.action}`]])]);
    });
  return result;
}
