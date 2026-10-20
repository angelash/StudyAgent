import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const blanks = (stem: string, values: Array<[string, string, number]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (index: number, stem: string, answer: string, alternatives: string[], analysis: string, blocks?: QuestionBlock[]): Task => {
  const options = [answer, ...alternatives], offset = index % options.length;
  return { stem, mode: 'single_choice', answer, options: [...options.slice(offset), ...options.slice(0, offset)], analysis, ...(blocks ? { blocks } : {}) };
};

/** Finite authored structures; extra fields and changed numbers never create extra independent responses. */
export function buildFourthGradeNumberProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2, expectedSeconds })) });

  add('core:math:bigplace', 'number-class-zero-place-audit', 'understanding', '核对万级和不足四位个级的占位',
    '万级、个级与一份完整数记录 → 数量守恒判断', '同一组成有正确和丢零主张；不能按数字串直接拼接短个级。', 75, n => {
      const index = Math.floor(n / 2), wan = [3, 12, 40, 107, 305, 920][index], ones = [7, 30, 105, 0, 307, 80][index];
      const total = wan * 10000 + ones, claim = n % 2 ? Number(`${wan}${ones}`) : total;
      return { stem: `一个数由${wan}个万和${ones}个一组成，有人把完整数写成${claim}。这份记录正确吗？`, mode: 'boolean', answer: claim === total,
        analysis: `万级的${wan}表示${wan * 10000}，个级要保留千、百、十、个四个位置；${wan * 10000}+${ones}=${total}。个级不足四位时仍须用0占住空数位。` };
    });
  add('core:math:bigplace', 'number-class-compose', 'procedure', '分别记录万级分量和合成后的整数',
    '按级记录的数量表 → 万级实际数量 → 完整数', '沿用已有数级合成题族；两空是一份合成过程，不增加样本数。', 85, n => {
      const wan = [5, 20, 103, 407, 60, 900, 18, 304, 70, 801, 12, 99][n];
      const ones = [0, 6, 40, 307, 1000, 2005, 90, 9, 800, 101, 7000, 9999][n];
      return blanks('下表给出同一个数的两个分量。先记录万级分量所表示的实际数量，再合成完整整数。',
        [['wanValue', '万级分量表示多少个一', wan * 10000], ['whole', '完整整数是多少', wan * 10000 + ones]],
        `${wan}个万表示${wan * 10000}个一，另加${ones}个一，完整整数为${wan * 10000 + ones}；个级必须占满四个数位。`,
        [table(['分量', '数量'], [['万级', `${wan}个万`], ['个级', `${ones}个一`]])]);
    });
  add('core:math:bigplace', 'number-class-inventory-boxes-inverse', 'transfer', '从整万包装和精确库存恢复整箱数量',
    '每箱一万、总库存和散张 → 去掉散张 → 整箱数', '先识别包装计数单位再逆向分解总量，区别于直接读取数级标签。', 95, n => {
      const boxes = 12 + n * 7, loose = [0, 7, 30, 405, 1000, 2008, 90, 806, 4, 100, 9000, 9999][n], total = boxes * 10000 + loose;
      return { stem: `卡片每整箱装10000张。精确库存是${total}张，其中散张有${loose}张，其余都是装满的整箱。原来有几整箱？`, answer: boxes,
        analysis: `从全部${total}张中去掉${loose}张散张，剩${boxes * 10000}张；每箱10000张，所以是${boxes}整箱。不能把散张个数拼到整箱个数后代替数量换算。` };
    });
  add('core:math:bigplace', 'number-class-masked-ledger-recovery', 'transfer', '用完整数恢复被遮住的数级并核对零占位',
    '精确总数与一栏已知数级 → 还原另一栏 → 核对该栏计数单位', '从完整整数反向恢复万级或个级；交替遮住两栏，保留不足四位和零个级。', 90, n => {
      const wan = [17, 30, 206, 70, 508, 900, 41, 105, 80, 302, 60, 707][n];
      const ones = [0, 0, 30, 506, 1000, 2007, 90, 800, 9, 100, 4000, 9999][n], hiddenWan = n % 2 === 0;
      return { stem: `仓库精确记录为${wan * 10000 + ones}张卡片。下表按万级和个级记录同一数量，其中一栏被遮住。被遮住一栏的个数是多少？（按表中该栏的计数单位填写）`, answer: hiddenWan ? wan : ones,
        blocks: [table(['数级', '计数单位', '个数'], [['万级', '万', hiddenWan ? '被遮住' : String(wan)], ['个级', '一', hiddenWan ? String(ones) : '被遮住']])],
        analysis: `${wan * 10000 + ones}由${wan}个万和${ones}个一组成。万级记录的是万的个数，个级记录不足一万的个数；被遮住一栏应填${hiddenWan ? wan : ones}，不能把空数位移走。` };
    });

  add('core:math:round1000', 'round-thousand-midpoint-claim', 'understanding', '按指定保留位核对中点与进舍',
    '同一精确数与两种整千记录 → 判断四舍五入', '成对使用正确和错误记录，覆盖499、500、999及跨万进位。', 75, n => {
      const value = [4499, 4500, 4999, 9499, 9500, 9999][Math.floor(n / 2)], rounded = Math.round(value / 1000) * 1000;
      const claim = n % 2 ? (rounded === Math.floor(value / 1000) * 1000 ? rounded + 1000 : rounded - 1000) : rounded;
      return { stem: `把精确整数${value}四舍五入到千位，有人记录为约${claim}。按这个保留位，这份近似记录正确吗？`, mode: 'boolean', answer: claim === rounded,
        analysis: `应观察百位和它后面的数量：不到半千向下，达到半千向上；${value}四舍五入到千位为${rounded}。跨过整万时仍按同一规则进位。` };
    });
  add('core:math:round1000', 'round-thousand', 'procedure', '记录相邻整千、距离和取近结果',
    '精确整数 → 下邻与上邻整千 → 两端距离 → 四舍五入', '沿用旧四舍五入计算题族；中间记录不是额外的独立题族。', 110, n => {
      const value = [1000, 1499, 1500, 1999, 4001, 4499, 4500, 9999, 10000, 10499, 10500, 19999][n];
      const lower = Math.floor(value / 1000) * 1000, upper = lower + 1000;
      return blanks(`把${value}四舍五入到千位。这里“下邻”允许等于原数，“上邻”指比下邻大1000的下一个整千；距离相同时取较大的整千。`,
        [['lower', '下邻整千', lower], ['distanceDown', '离下邻的距离', value - lower], ['distanceUp', '离上邻的距离', upper - value], ['rounded', '四舍五入到千位', Math.round(value / 1000) * 1000]],
        `下邻${lower}、上邻${upper}，两端距离分别为${value - lower}与${upper - value}；相等时取上邻，因此近似为${Math.round(value / 1000) * 1000}。`);
    });
  add('core:math:round1000', 'round-thousand-inverse-integer-range', 'transfer', '由近似整千恢复可能精确值的闭区间',
    '非负整数的整千近似值 → 两端中点的包含关系 → 最小和最大精确整数', '不是由精确数求近似值；反向检查上边中点须归入下一千，0附近还需保留非负约束。', 100, n => {
      const target = [0, 1, 2, 5, 9, 10, 11, 20, 35, 100, 101, 999][n] * 1000, low = Math.max(0, target - 500), high = target + 499;
      return blanks(`某个非负整数四舍五入到千位后是${target}。它原来可能的最小整数和最大整数分别是多少？`,
        [['minimum', '可能的最小精确整数', low], ['maximum', '可能的最大精确整数', high]],
        `${low}可以取到；上边的中点${target + 500}必须进到下一千，所以最大只到${high}。原数非负，近似为0时下界是0。`);
    });
  add('core:math:round1000', 'round-thousand-exact-stock-decision', 'transfer', '用精确数量验证近似记录下的实际缺口',
    '精确库存、整千摘要和实际需求 → 分开记录缺口与剩余', '整千摘要不能替代精确库存；含近似数看似足够却短缺、看似不足却足够和恰好三种情形。', 95, n => {
      const stock = [4499, 4500, 4999, 9500, 9999, 10499, 10500, 1499, 1500, 1999, 10000, 20001][n];
      const needed = stock + [1, -1, 0][n % 3], shortfall = Math.max(0, needed - stock), remaining = Math.max(0, stock - needed);
      return blanks('下表“精确库存”已经逐件核实，“整千摘要”只供介绍规模。要满足本次实际需求，分别记录尚缺和满足需求后的剩余；没有的那一项填0。',
        [['shortfall', '尚缺几件', shortfall], ['remaining', '满足需求后剩几件', remaining]],
        `实际只能用精确库存${stock}件与需求${needed}件核对，整千摘要不是额外物品。尚缺${shortfall}件；满足需求后的剩余为${remaining}件。`,
        [table(['记录', '件数'], [['精确库存', String(stock)], ['整千摘要（约）', String(Math.round(stock / 1000) * 1000)], ['实际需求', String(needed)]])]);
    });

  const multiplication = (atomId: string, code: string, multiplicands: number[], multipliers: number[], legacyFamily: string) => {
    add(atomId, `${code}-tens-part-unit-audit`, 'understanding', '核对乘数十位部分积的实际计数单位',
      '两位乘数的十位与一份部分积主张 → 数位单位核查', '同一因数配正确与少乘10的主张；计算总积不能代替核查这部分的单位。', 75, n => {
        const index = Math.floor(n / 2), a = multiplicands[index], b = multipliers[index], tens = Math.floor(b / 10);
        const claim = a * tens * (n % 2 ? 1 : 10);
        return { stem: `计算${a}×${b}，乘数十位上的${tens}表示${tens}个十。有人把这一部分的实际乘积记为${claim}。这个部分积记录正确吗？`, mode: 'boolean', answer: claim === a * tens * 10,
          analysis: `十位表示${tens * 10}组，这部分应为${a}×${tens * 10}=${a * tens * 10}。${a * tens}只算了${tens}组，少了计数单位十。` };
      });
    add(atomId, legacyFamily, 'procedure', '记录个位和十位的实际部分积并合并',
      '数位分解的乘法 → 个位部分积、十位部分积与总积', '沿用已有直接列式计算题族；分项记录用于本题过程，不作为多个独立样本。', 100, n => {
        const a = multiplicands[n], b = multipliers[n], tens = Math.floor(b / 10) * 10, ones = b % 10;
        return blanks(`按乘数的个位和十位分开计算${a}×${b}。十位一栏填写带计数单位的实际部分积；某一分量为0时也填0。`,
          [['onesProduct', '乘数个位这部分的实际积', a * ones], ['tensProduct', '乘数十位这部分的实际积', a * tens], ['total', '合并后的积', a * b]],
          `${b}=${tens}+${ones}，两部分分别为${a * tens}与${a * ones}，合并是${a * b}。十位贡献必须保留十的单位，0分量不可以移走其他数位。`);
      });
  };
  multiplication('foundation:math:multiplytwo', 'multiply-two', [23, 34, 40, 56, 67, 70, 81, 92, 30, 45, 68, 99],
    [12, 23, 30, 41, 52, 60, 27, 38, 49, 50, 64, 72], 'multiply-two-symbol');
  add('foundation:math:multiplytwo', 'multiply-two-split-seating', 'transfer', '从分区座位记录选择完整覆盖模型',
    '每排两个座位分区与相同排数 → 两区都重复 → 选择总量表达', '先读取空间分区的共同排数，排除一侧未重复或把排数当座位数相加。', 90, n => {
      const left = (2 + n % 6) * 10, right = 1 + n % 8, rows = 12 + n;
      return choose(n, '每排由左、右两区组成，所有排都一样。哪条算式完整数出了全部座位？',
        `${left}×${rows}+${right}×${rows}`, [`${left}×${rows}+${right}`, `${left + right}+${rows}`],
        `左区每排${left}个座位、右区每排${right}个，两区都重复${rows}排；所以要分别乘同一排数再合并。`,
        [table(['记录', '数量'], [['每排左区座位', String(left)], ['每排右区座位', String(right)], ['相同排数', String(rows)]])]);
    });
  add('foundation:math:multiplytwo', 'multiply-two-restore-row-count', 'transfer', '用已知部分与总覆盖恢复缺失排数',
    '每排座位、已知整十排与总座位 → 未记座位数 → 缺少的排数', '反向恢复另一部分，区分已知排数、缺少排数与全部排数；不能把总量当成部分。', 105, n => {
      const perRow = 21 + n * 2, knownRows = (1 + n % 4) * 10, missingRows = 1 + n % 9, total = perRow * (knownRows + missingRows);
      return blanks(`礼堂每排${perRow}个座位，所有排一样。已记入${knownRows}排，全部共有${total}个座位；其余排数被遮住。先求尚未记入的座位，再恢复尚未记入的排数。`,
        [['missingSeats', '尚未记入几个座位', perRow * missingRows], ['missingRows', '尚未记入几排', missingRows]],
        `已记入${perRow}×${knownRows}=${perRow * knownRows}个，余下${perRow * missingRows}个；每排${perRow}个，对应${missingRows}排。全部排数为${knownRows + missingRows}，不等于待恢复的排数。`);
    });

  multiplication('core:math:multiply3by2', 'multiply-large', [105, 208, 304, 406, 507, 609, 710, 803, 900, 125, 246, 999],
    [12, 23, 30, 41, 52, 60, 27, 38, 49, 50, 64, 72], 'multiply-large-column');
  add('core:math:multiply3by2', 'multiply-large-batch-missing', 'transfer', '从装箱交接的总量恢复遗漏批次',
    '每箱数量、已发箱数和两批总件数 → 后批件数 → 后批箱数', '反向恢复批次，区分箱和件及单批与总量，不仅更换直接乘法的物品名。', 105, n => {
      const perBox = [105, 208, 304, 406, 507, 609, 710, 803, 900, 125, 246, 999][n], first = 10 + n, second = 1 + n % 9;
      return blanks('两批货每箱件数相同，所有箱均装满且没有散件。下表后批的交接记录缺失，先恢复后批件数，再恢复后批箱数。',
        [['secondPieces', '后批共几件', perBox * second], ['secondBoxes', '后批共几箱', second]],
        `首批${perBox}×${first}=${perBox * first}件；从两批总量中减掉首批，后批为${perBox * second}件，对应${second}个每箱${perBox}件的整箱。`,
        [table(['记录', '数量'], [['每箱件数', String(perBox)], ['首批箱数', String(first)], ['两批总件数', String(perBox * (first + second))]])]);
    });
  add('core:math:multiply3by2', 'multiply-large-ledger-reconciliation', 'transfer', '核对总箱记录与分批清单是否表示相同件数',
    '完整箱记录与两批不同标签 → 分别求件数 → 总量一致性判断', '相同总箱数也可能因后批每箱件数变化而不等量；不能只看箱数相加。', 95, n => {
      const perBox = 101 + n * 13, first = 10 + n, second = 2 + n % 7, secondPerBox = perBox + (n % 2 ? 10 : 0);
      return { stem: '甲是一份总箱记录，乙由首批和后批两行组成。每行都按该行的每箱件数计算。甲记录的总件数与乙两批合计件数相同吗？', mode: 'boolean',
        answer: perBox * (first + second) === perBox * first + secondPerBox * second,
        blocks: [table(['记录', '每箱件数', '箱数'], [['甲总记录', String(perBox), String(first + second)], ['乙首批', String(perBox), String(first)], ['乙后批', String(secondPerBox), String(second)]])],
        analysis: `甲共${perBox * (first + second)}件，乙首批${perBox * first}件、后批${secondPerBox * second}件，合计${perBox * first + secondPerBox * second}件。总箱数相同还必须核对每箱数量；不能忽略后批标签。` };
    });

  add('core:math:divide2digit', 'divide-two-trial-total-audit', 'understanding', '用乘回验证试商能否恰好分完',
    '总量、两位除数与试商主张 → 乘回 → 恰好/过多/不足', '覆盖试商过大、过小和吻合；试商不是未经检验的精确商。', 80, n => {
      const divisor = [12, 15, 18, 24, 25, 32, 36, 45, 48, 52, 64, 75][n], quotient = 12 + n * 3, candidate = quotient + [1, 0, -1][n % 3];
      return { stem: `有${divisor * quotient}件物品，每箱装${divisor}件。小林试商为${candidate}，说：“这些满箱恰好装完，不多也不少。”这项主张正确吗？`, mode: 'boolean', answer: divisor * candidate === divisor * quotient,
        analysis: `将试商乘回：${divisor}×${candidate}=${divisor * candidate}，与总量${divisor * quotient}比较；只有相等时，才能把试商确认为恰好装完的精确商。` };
    });
  add('core:math:divide2digit', 'divide-two-symbol', 'procedure', '保留整十分组、余量和个位商的恢复过程',
    '整除算式 → 商的整十部分 → 对应已分量 → 未分量 → 个位商与全商', '沿用旧两位除数直接计算题族；五个空位只计一个独立响应，包含商个位为0。', 120, n => {
      const divisor = [12, 15, 18, 24, 25, 32, 36, 45, 48, 52, 64, 75][n], quotient = [12, 20, 21, 30, 38, 40, 49, 52, 60, 63, 70, 81][n];
      const tens = Math.floor(quotient / 10) * 10, ones = quotient % 10, total = divisor * quotient;
      return blanks(`计算${total}÷${divisor}，可以先取不超过精确商的最大整十数作为商的整十部分，再处理未分完的量。整十部分填写实际组数（如30），不要只写十位数字。`,
        [['tensGroups', '商的整十部分是几组', tens], ['grouped', '这些组分走多少', divisor * tens], ['unallocated', '尚未分完多少', divisor * ones], ['onesGroups', '再分几组', ones], ['quotient', '精确商', quotient]],
        `先分${tens}组，用去${divisor * tens}；还剩${divisor * ones}，再分${ones}组，所以精确商${quotient}。余量为0时个位商必须保留0。`);
    });
  add('core:math:divide2digit', 'divide-two-trial-ledger-selection', 'transfer', '复核试商及其乘回记录而不盲信相等标签',
    '多条试商与声称的乘积 → 独立乘回复核 → 选择恰好分完的有效记录', '一个错误试商伪写成与总量相等；既要核查记录的乘法，也要核对真实总量。', 100, n => {
      const divisor = 12 + n * 3, quotient = 14 + n * 2, total = divisor * quotient;
      const candidates = [{ q: quotient, product: total }, { q: quotient + 1, product: total }, { q: quotient - 1, product: divisor * (quotient - 1) }];
      const offset = n % 3, ordered = [...candidates.slice(offset), ...candidates.slice(0, offset)], labels = ['甲', '乙', '丙'];
      const answer = labels[ordered.findIndex(row => row.q * divisor === row.product && row.product === total)];
      return choose(n, `把${total}件物品按每箱${divisor}件全部装成满箱。下表乘回栏是别人写的，可能有错。哪条记录的试商和乘回都正确，而且恰好装完？`, answer, labels.filter(label => label !== answer),
        `必须重新核查“试商×${divisor}”。精确商${quotient}的真实乘积是${total}；试商${quotient + 1}虽然也把乘回栏写成${total}，真实乘积却是${divisor * (quotient + 1)}，不能通过。`,
        [table(['记录', '试商', '记录的乘积'], ordered.map((row, index) => [labels[index], String(row.q), String(row.product)]))]);
    });
  add('core:math:divide2digit', 'divide-two-stock-additional-boxes', 'transfer', '区分库存总箱数和还需装的箱数',
    '精确总库存、每箱量与已有满箱 → 待装件数 → 新增满箱数', '不是直接求全部商；从总量剔除已装部分后恢复剩余组数，无余数。', 105, n => {
      const divisor = 12 + n * 3, quotient = 15 + n * 2, packed = 2 + n % 7;
      return blanks(`共有${divisor * quotient}本书，每箱装${divisor}本。其中${packed}箱已装满，这些箱里的书包含在总数里。把其余书也全部装成满箱，不留散本。`,
        [['unpackedBooks', '还未装箱几本', divisor * (quotient - packed)], ['additionalBoxes', '还需装满几箱', quotient - packed]],
        `已装的${packed}箱占${divisor * packed}本，待装${divisor * (quotient - packed)}本，对应${quotient - packed}箱。全部共${quotient}箱，不等于还需新增的箱数。`);
    });

  add('core:math:distribute', 'distribute-equality-audit', 'understanding', '核查拆开后是否两项都乘同一因数',
    '一个和乘共同因数与一条展开记录 → 等价关系核查', '每组数字都有完整分配和漏乘第二项的主张，排除只凭一个正确结果推断规则掌握。', 75, n => {
      const index = Math.floor(n / 2), a = 3 + index, b = 20 + index * 10, c = 1 + index, right = n % 2 ? `${a}×${b}+${c}` : `${a}×${b}+${a}×${c}`;
      return { stem: `核对等式${a}×(${b}+${c})=${right}。这条等式成立吗？`, mode: 'boolean', answer: n % 2 === 0,
        analysis: `${a}同时乘括号内的两部分，应为${a}×${b}+${a}×${c}。第二项只有${c}会漏掉共同因数${a}；本组因数大于1且第二部分不为0，不会偶然等量。` };
    });
  add('core:math:distribute', 'distribute-linked-products', 'procedure', '分别计算分配后的两项再合并',
    '和的乘积 → 两项各自乘积 → 合计', '区别于旧单空对应因数题；本组检查两个部分的实际数量与合并，不把三空算成三个样本。', 100, n => {
      const factor = 12 + n, first = 20 + n % 4 * 10, second = n % 10;
      return blanks(`用分配关系计算${factor}×(${first}+${second})。分别记录两个部分积和合计，0分量也填0。`,
        [['firstProduct', '第一部分的积', factor * first], ['secondProduct', '第二部分的积', factor * second], ['total', '两部分合计', factor * (first + second)]],
        `两项都有共同因数${factor}：${factor}×${first}=${factor * first}，${factor}×${second}=${factor * second}，合计${factor * (first + second)}。不能只乘第一项。`);
    });
  add('core:math:distribute', 'distribute-recover-common-count', 'transfer', '从两项费用反向恢复共同份数与每份合计',
    '同批每人两项费用与分别小计 → 共同人数 → 每人总费用', '反向检验两项共有同一人数；人数和每人费用是不同的量，不把两个小计相加当人数。', 100, n => {
      const material = 12 + n, tool = 3 + n % 7, people = 3 + n;
      return blanks('同一批学生每人领取一份材料和一套工具，没有其他费用和优惠。人数一栏被遮住，下表分别记录两项的小计。恢复共同人数和每人两项费用的合计。',
        [['commonCount', '这批共有几人', people], ['perPerson', '每人两项合计几元', material + tool]],
        `材料${material * people}元对应${people}份，工具${tool * people}元也对应${people}份，所以共同人数是${people}。每人合计${material + tool}元，全部费用可写成${people}×(${material}+${tool})。`,
        [table(['项目', '每人费用（元）', '这批小计（元）'], [['材料', String(material), String(material * people)], ['工具', String(tool), String(tool * people)]])]);
    });
  add('core:math:distribute', 'distribute-shared-quantity-condition', 'transfer', '核查实际清单是否存在可合并的共同每份量',
    '两批材料的每份用量与份数 → 核对共同用量 → 合并方案判断', '相同单位不等于相同每份量；每份用量不同时不能直接把两批份数合并为同规格。', 90, n => {
      const per = 12 + n, first = 10 + n, second = 2 + n % 7, otherPer = per + (n % 2 ? 1 + n % 3 : 0);
      return { stem: `两批细条保持原样，不剪接也不更换。只根据原清单，能把它们合并登记为“${first + second}份，每份${per}米”的同规格材料吗？`, mode: 'boolean', answer: per === otherPer,
        blocks: [table(['批次', '每份米数', '份数'], [['第一批', String(per), String(first)], ['第二批', String(otherPer), String(second)]])],
        analysis: `两批每份分别为${per}米和${otherPer}米。只有每份量相同，才能按共同因数${per}合并份数；单位都是米，并不保证每份长度相同。原总长为${per * first + otherPer * second}米，拟登记总长为${per * (first + second)}米。` };
    });
  return result;
}
