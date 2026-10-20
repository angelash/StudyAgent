import type { KnowledgeAtom, MeasurementDimension } from '@study-agent/contracts';
import type { Exercise, FoundationDefinition } from './foundation-curriculum';
import type { AuthoredProbeFamily } from './authored-math-probes';

export const divisionRegroupAtom: KnowledgeAtom = {
  id: 'atomic:math:divisionregroup', subject: 'math', grade: 3, term: 'both', name: '把余下的十换成一并合并个位', strand: '数与运算',
  objective: '在剩余十和原个位已给定时，把全部剩余十换成一并合并原个位，保持未分数量不变',
  successCriterion: '能分别记录换出的一与合并后的一，包含零余十或零个位；用实物记录和逆向新题核对，并在真实间隔后独立验证。',
  prerequisiteIds: ['foundation:math:placevalue'], parentId: 'foundation:math:divisiondigits',
  curriculumVersion: 'original-atomic-math-v1', status: 'published', version: 1,
  teaching: {
    reviewStatus: 'approved',
    explanation: '先分完高位后，余下的十仍然属于未分的量。每个十换成10个一，再与原个位合并；换单位改变表示，不改变未分总量。本点给定余十，不要求先求高位商。',
    example: { prompt: '高位分后还余2个十，原个位是6个一。合起来还有多少个一待分？',
      steps: ['只看未分的2个十与原个位6个一，已经分走的十不再计入。', '2个十全部拆开，换成20个一。', '把同一种单位合并：20个一加6个一是26个一。'],
      conclusion: '还余26个一待分。2与6不能直接相加，因为原来的计数单位不同。' },
    commonErrors: [{ code: 'regroup_units_added_directly', observation: '把余十的个数与原个位直接相加，或漏记原个位。',
      alternativeExplanations: ['可能未把十换成一，应给定余十单独核查。', '也可能上一步余十已经算错，后续只是沿用错的状态。', '也可能理解换单位但合并或记录时遗漏，应换材料复核。'],
      verification: '先给定正确余十，独立记录换出的一与合并后的一，再用成捆散根和逆向新题验证；若上游余十错误，先核查上游，不据连带错误确定本点问题。' }],
    verification: {
      understanding: '给定余十与原个位，核对数量守恒记录，说明同一种单位才可直接合并。',
      procedure: '不提供示范，分别记录余十换出的一和合并后的一；加入零余十或零个位。',
      transfer: '读取尚未分配的成捆散根清单，再由合并数量反推原个位，用两种不同新题族核查。',
      retention: '三天后更换数量与材料，独立完成基础及迁移新题；当天同题重复不能证明保持。',
    },
  },
};

export function buildAtomicMathDefinitions(): FoundationDefinition[] {
  return [{ atom: structuredClone(divisionRegroupAtom), exercises: [] }];
}

/** These tasks give the remaining tens explicitly; a failed upstream division is not a child-point observation. */
export function buildAtomicProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string,
    expectedSeconds: number, make: (index: number) => Omit<Exercise, 'family' | 'dimension'>) => result.push({
    atomId: divisionRegroupAtom.id, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, expectedSeconds, identityVersion: 2 })),
  });
  add('regroup-given-remainder-audit', 'understanding', '已给余量时核对合并是否保持数量',
    '已给余十、原个位和合并主张 → 核对十与一的单位',
    '不要求计算除法或高位余量，直接隔离换单位的理解；正确与直接加个数的错误记录成对出现。', 55, n => {
      const tens = 1 + Math.floor(n / 2), ones = 2 + Math.floor(n / 2) % 7, claim = tens * (n % 2 ? 1 : 10) + ones;
      return { stem: `已知高位分完后剩${tens}个十，原来个位另有${ones}个一。小林记：“全部换成一后，还待分${claim}个一。”这条记录保持了未分数量吗？`,
        mode: 'boolean', answer: n % 2 === 0,
        analysis: `${tens}个十是${tens * 10}个一，合上原来的${ones}个一，共${tens * 10 + ones}个一。这里余十已给定，不需要重新计算高位分配。` };
    });
  add('regroup-given-remainder-record', 'procedure', '分别记录换出和合并后的一',
    '已给余十和原个位 → 十换出的一 → 合并后的一',
    '一次操作中的两个空合为一个样本；零余十或零个位仍保留相应单位。', 70, n => {
      const tens = n % 4, ones = (n * 3) % 10;
      return { stem: `剩余量已核对：${tens}个十，原个位另有${ones}个一。全部换成一后继续分，填写换出的量和待分总量。`, mode: 'multi_blank',
        responseShape: { entries: [{ key: 'exchangedOnes', label: '只把余十换出几个一' }, { key: 'combinedOnes', label: '合上原个位后待分几个一' }] },
        answer: [{ key: 'exchangedOnes', value: String(tens * 10) }, { key: 'combinedOnes', value: String(tens * 10 + ones) }],
        analysis: `余十单独换出${tens * 10}个一，合并原个位${ones}个一后共${tens * 10 + ones}个一。零余十不增加一，零个位不改变换出的量。` };
    });
  add('regroup-unshared-bundle-inventory', 'transfer', '从未分实物清单恢复换单位后的总量',
    '尚未分配的实际整捆和散根图 → 每捆十根 → 全拆开的一',
    '清单用实际图元而非给出数字总数；已经分配的材料不在表中，须数清两种单位。', 80, n => {
      const tens = n % 4, ones = 1 + Math.floor(n / 4) * 3;
      return { stem: '表中只摆出尚未分配的小棒：▣每个是一捆10根，│每个是一根散棒，“无”表示该栏没有。把全部整捆拆开，与散棒合在一起，还待分多少根？',
        answer: tens * 10 + ones, blocks: [{ id: 'unshared-inventory', type: 'table', headers: ['尚未分配的摆法', '实际全部小棒'],
          rows: [['整捆（▣每捆10根）', tens ? Array(tens).fill('▣').join(' ') : '无'], ['散棒（│每个1根）', Array(ones).fill('│').join(' ')]] }],
        analysis: `表中有${tens}整捆和${ones}根散棒。只把尚未分配的捆拆开，共${tens * 10}+${ones}=${tens * 10 + ones}根待分。` };
    });
  add('regroup-recover-original-ones', 'transfer', '由合并后数量反推原个位',
    '已给剩余十和全拆后的总量 → 扣除余十换出的一 → 恢复原个位',
    '逆向核查换单位的守恒关系；先换单位再去掉这一部分，不能从总量直接减十的个数。', 75, n => {
      const tens = 1 + n % 6, ones = (n * 4) % 10, merged = tens * 10 + ones;
      return { stem: `记录缺了一栏：剩余${tens}个十，原个位的个数被遮住；把余十全部换成一并合上原个位后，待分总量是${merged}个一。原个位有几个一？`,
        answer: ones, analysis: `${tens}个十换出${tens * 10}个一；从合并后的${merged}个一中扣去这部分，原个位是${merged}-${tens * 10}=${ones}个一。` };
    });
  return result;
}
