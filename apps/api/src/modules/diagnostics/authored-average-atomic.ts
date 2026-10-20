import type { KnowledgeAtom, MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

export const averageCountAtom: KnowledgeAtom = {
  id: 'atomic:math:averagecount', subject: 'math', grade: 4, term: 'both', name: '明确平均对象并把零数据计入份数', strand: '统计与概率',
  objective: '按问题指定的人、天等平均对象确定份数；参与且为0的记录仍计入，未参加不混入，记录缺失不当成0',
  successCriterion: '能从完整记录和参与范围独立选择分母，区分0、未参加与未记录，在对象改变的新题中验证，并经过真实间隔复核。',
  prerequisiteIds: ['core:math:count'], parentId: 'core:math:average', curriculumVersion: 'original-atomic-average-v1', status: 'published', version: 1,
  teaching: {
    reviewStatus: 'approved',
    explanation: '先说清平均给谁或平均到哪一天，再把这些对象各计一次。某位参与者的数量为0，仍然是一个参与对象；明确未参加的人不属于本次平均范围。参加但未记录的人仍在对象中，数据尚不完整，不能把未记录当0来算平均。本点只隔离对象和份数，不用求和或除法正确代替这一判断。',
    example: { prompt: '甲、乙、丙都参加投篮，分别命中5次、0次、7次；丁没有参加。求全部参加者平均命中次数，分给几个对象？',
      steps: ['问题指定全部参加者，先列出甲、乙、丙；丁没有参加。', '乙命中0次仍然参与，不能因数量为0删掉乙。', '三个参与者每人计一次，分母应为3。若有人参加但没有记录，需先补齐数据。'],
      conclusion: '平均到3名参与者，0表示数量，不表示这个人不存在。此结论还没有证明总量合计或除法都会做。' },
    commonErrors: [{ code: 'average_population_or_zero_count', observation: '只数非零数据、把未参加者混入，或把未记录误作0。',
      alternativeExplanations: ['可能把数量0误认为没有平均对象。', '也可能没有读清平均到每人还是每天，需要保持同一张表改变问题核查。', '也可能对象理解正确而逐一计数遗漏，应另测计数；总量或除法错误需分开验证。'],
      verification: '先不要求求和或除法，只让孩子指出参与范围与分母，再用零记录、未参加、未记录的对照和同表不同对象的新题验证。' }],
    verification: {
      understanding: '在同一份含0记录的数据中，核对保留全部对象与只保留非零对象的两种主张。',
      procedure: '从连续完整记录中分别记出零记录个数和平均到的总份数，两个空仍只是一份响应。',
      transfer: '把参与0、未参加和未记录分开，再用多人多天的同一张表分别确定每人与每天的分母。',
      retention: '三天后换新记录与平均对象，独立完成基础及两类迁移；即时重复或有提示不能证明保持。',
    },
  },
};

type Task = Omit<Exercise, 'family' | 'dimension'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, string | number]>, analysis: string, blocks: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, blocks });

/** These tasks isolate the denominator. No summation or division answer is needed. */
export function buildAverageCountProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId: averageCountAtom.id, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, expectedSeconds, identityVersion: 2 })) });

  const records = [[0, 6, 9], [4, 0, 7, 9], [0, 0, 5, 7, 8], [3, 4, 0, 5, 6, 7], [0, 0, 0, 0], [8, 0, 0, 5, 10, 15, 20]];
  add('average-count-zero-record-claim', 'understanding', '含0数据时核对分母是否保留全部对象',
    '连续完整的每天记录 → 核对只数非零或全部记录的主张', '同一份数据配正确与错误主张，全部为0时也不能把份数写0。', 60, n => {
      const values = records[Math.floor(n / 2)], denominator = n % 2 ? values.filter(value => value !== 0).length : values.length;
      return { stem: `表中是连续各天的完整跳绳记录，每一天都参与统计，0次表示当天没有跳成。求平均每天跳成几次，有人说“总次数应平均分成${denominator}份”。这个分母选择正确吗？`,
        mode: 'boolean', answer: denominator === values.length,
        blocks: [table(['统计日', '跳成次数'], values.map((value, i) => [`第${i + 1}天`, String(value)]))],
        analysis: `问题平均到表中全部${values.length}天，每天是一份，0次的天仍然存在。不能只数非零记录；本次应分${values.length}份，这里不要求计算平均数。` };
    });
  add('average-count-complete-daily-record', 'procedure', '分别保留零记录个数与全部天数',
    '连续且完整的逐天记录 → 数出零记录 → 确定平均到的份数', '零记录的个数与总份数分开；不给平均数结果，不把最终除法代替对象计数。', 75, n => {
      const count = 3 + n % 4, values = Array.from({ length: count }, (_, i) => (i + n) % 3 === 0 || i === 0 ? 0 : 4 + n + i * 2);
      return blanks('下面是连续各天的完整阅读记录，所有天都计入“平均每天”。先核对0页记录，再选择分母，不用求平均页数。',
        [['zeroDays', '其中有几天记录为0页', values.filter(value => !value).length], ['denominator', '平均每天时应分成几份', count]],
        `共有${count}条逐天记录，其中${values.filter(value => !value).length}天为0页。每条都是明确的一天，分母应为${count}，不能只数有阅读的天。`,
        [table(['记录日', '阅读页数'], values.map((value, i) => [`第${i + 1}天`, String(value)]))]);
    });
  add('average-count-participation-and-missingness', 'transfer', '区分参与0、未参加与参与但未记录',
    '含明确参与状态的实际名单 → 全部参与者份数 → 数据是否已完整', '未记录不是0，不能悄悄删除未记录的参与者；信息不足时只记录对象数，不编造平均值。', 95, n => {
      const count = 4 + n % 3, names = ['小安', '小宁', '小禾', '小乔', '小乐', '小川'], absentIndex = count - 1, missing = n % 2 === 1;
      const record = Array.from({ length: count }, (_, i) => [names[i], i === absentIndex ? '未参加' : '参加',
        i === absentIndex ? '—' : i === 0 ? '0' : missing && i === 1 ? '未记录' : String(3 + n + i * 2)]);
      return blanks('本次求全部参加者平均投中次数。名单中“未参加”不属于本次范围；“参加但未记录”仍是参与对象，数量还不知道。先选择对象数，再核对现有数量能否直接计算全部参加者的平均值，不用求平均值。',
        [['participants', '本次全部参加者有几人', count - 1], ['ready', '现有数量记录是否已完整（填是或否）', missing ? '否' : '是']],
        `明确参加者共${count - 1}人，投中0次的人仍计入，未参加者不计入。${missing ? '有参与者未记录数量，不能当0或删除，应补齐后再算全部参加者的平均值。' : '全部参加者都有数字记录，可以按这些对象计算平均值。'}`,
        [table(['同学', '本次状态', '投中次数'], record)]);
    });
  add('average-count-person-versus-day', 'transfer', '同一张多人与多天表按问题选择分母',
    '完整多人多天表 → 分别指定每人和每天 → 对应份数', '所有人的所有记录先合成同一总量，平均到人或天时对象不同；不按单元格总数或非零数量选分母。', 95, n => {
      const people = 3 + n % 4, days = 2 + n % 2, names = ['小米', '小冬', '小苗', '小夏', '小可', '小文'];
      const record = Array.from({ length: people }, (_, person) => [names[person], ...Array.from({ length: days }, (_, day) => (person + day + n) % 3 ? String(2 + n + person + day * 2) : '0')]);
      return blanks('表中同学在所有列出的天都有完整记录，0页也有效。两问都先把表里所有页数合成同一个总量：一问把这几天合计平均到每名同学，一问把全组合计平均到每天。只分别填写分母，不用求平均页数。',
        [['perPerson', '这几天合计平均每名同学，应分几份', people], ['perDay', '全组合计平均每天，应分几份', days]],
        `同一总量平均到人时有${people}名同学，分${people}份；平均到天时有${days}天，分${days}份。0页不删对象，单元格个数也不能替代题目指定的人数或天数。`,
        [table(['同学', ...Array.from({ length: days }, (_, day) => `第${day + 1}天（页）`)], record)]);
    });
  return result;
}
