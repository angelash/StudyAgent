import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import fixtures from '../../../../../resources/curriculum/geometry-probes-v1.json';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'dimension' | 'family'>;
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const figure = (name: string, alt: string): QuestionBlock => ({ id: 'figure', type: 'image', url: `/question-assets/geometry-probes-v1/${name}.svg`, alt });
const blanks = (stem: string, values: Array<[string, string, number]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'multi_blank', answer: values.map(([key, , value]) => ({ key, value: String(value) })),
  responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis, ...(blocks ? { blocks } : {}) });
const choose = (stem: string, answer: string, alternatives: string[], analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  mode: 'single_choice', answer, options: [answer, ...alternatives], analysis, ...(blocks ? { blocks } : {}) });

/** Boundary length, complete coverage and square-unit conservation require different observations. */
export function buildGeometryProbeFamilies(): AuthoredProbeFamily[] {
  const result: AuthoredProbeFamily[] = [];
  const add = (atomId: string, family: string, dimension: MeasurementDimension, behavior: string, structure: string,
    distinction: string, expectedSeconds: number, make: (index: number) => Task) => result.push({ atomId, family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, index) => ({ ...make(index), family, dimension, identityVersion: 2, expectedSeconds })) });

  add('foundation:math:perimeter', 'perimeter-closed-boundary-audit', 'understanding', '辨别完整一圈、半圈与内部覆盖',
    '长宽与周长任务 → 选择完整边界的数量表达', '检查四条边的测量模型，不由一次计算答案推断概念。', 60, n => {
      const length = 9 + n, width = 3 + n % 4;
      return choose(`长方形长${length}厘米、宽${width}厘米。要量沿边界完整走一圈的长度，哪份记录对应这个任务？`,
        `${length}+${width}+${length}+${width}（厘米）`, [`${length}+${width}（厘米）`, `${length}×${width}（平方厘米）`],
        `一圈要依次走过两条${length}厘米和两条${width}厘米的边；只加一长一宽是半圈，长乘宽数的是内部单位正方形。`);
    });
  add('foundation:math:perimeter', 'perimeter-formula', 'procedure', '分别记录两组对边再核对完整边界',
    '长宽 → 两条长的合计、两条宽的合计 → 周长', '沿用原长方形周长计算题族；三空保留同一道题的过程，不算三次独立观察。', 85, n => {
      const length = 7 + n, width = 2 + n % 5;
      return blanks(`长方形长${length}厘米、宽${width}厘米。沿封闭边界量一圈，分别记录两组对边与全长。`,
        [['longPair', '两条长边合计几厘米', length * 2], ['shortPair', '两条短边合计几厘米', width * 2], ['perimeter', '完整一圈几厘米', (length + width) * 2]],
        `两条长边合计${length}+${length}=${length * 2}厘米，两条短边合计${width}+${width}=${width * 2}厘米；四边合计${(length + width) * 2}厘米。`);
    });
  add('foundation:math:perimeter', 'perimeter-recover-width', 'transfer', '由完整边界反向恢复缺少的宽',
    '全周长与一条长 → 半周长 → 未知宽', '由边界总量反向恢复两种边长，区别于直接给长宽求一圈。', 90, n => {
      const length = 9 + n, width = 2 + n % 6, perimeter = (length + width) * 2;
      return blanks(`一张长方形卡纸完整一圈是${perimeter}厘米，一条长为${length}厘米。一条宽的数值被遮住，先记录半圈，再恢复宽。`,
        [['halfPerimeter', '一条长和一条宽合计几厘米', length + width], ['width', '一条宽是几厘米', width]],
        `完整一圈含两组相同的长加宽，半圈是${perimeter}÷2=${length + width}厘米，再去掉一条长${length}厘米，宽为${width}厘米。`);
    });
  add('foundation:math:perimeter', 'perimeter-gate-and-interior-path', 'transfer', '区分完整周长、开口与实际围栏',
    '带门和内部小路的边界图 → 完整一圈 → 除门外的围栏', '开口不改变完整外框周长；实际围栏需去掉门，内部小路不是边界。', 100, n => {
      const { length, width, gate } = fixtures.rectangleGates[n], perimeter = 2 * (length + width);
      return blanks('长方形菜地按图留一个门，其余外边界全部围栏。虚线是菜地内部的小路，不铺围栏；不考虑柱子和接头。分别记录完整一圈和实际围栏长度。',
        [['completeBoundary', '如果封闭门口，完整一圈几米', perimeter], ['fence', '除门口外实际围栏几米', perimeter - gate]],
        `完整外框长${length}米、宽${width}米，一圈${perimeter}米；门宽${gate}米不铺围栏，所以用${perimeter - gate}米。内部小路不属于外边界。`,
        [figure(`rectangle-gate-${n}`, `长方形长${length}米、宽${width}米，下边有${gate}米的门口。内部有一条虚线小路，四条外边与内部小路分开标示。`)]);
    });

  add('core:math:squareperimeter', 'square-four-edge-claim', 'understanding', '核对周长是否计入四条等边',
    '正方形边长与一圈记录 → 四边总长和平方覆盖的对照', '同一边长分别有成立和不成立的主张，不让边长本身决定真假。', 60, n => {
      const side = [3, 5, 6, 7, 8, 9][Math.floor(n / 2)], claim = n % 2 ? side * side : side * 4;
      return { stem: `正方形边长${side}厘米，有人把沿四条外边完整一圈记成${claim}厘米。这个长度记录正确吗？`, mode: 'boolean', answer: claim === side * 4,
        analysis: `四条边都长${side}厘米，总长为${side}+${side}+${side}+${side}=${side * 4}厘米。边长乘边长得到内部覆盖的面积，不能把它当成一圈的长度。` };
    });
  add('core:math:squareperimeter', 'square-perimeter', 'procedure', '联动记录半圈和四边合计',
    '边长 → 两条相邻边 → 四条边', '沿用原正方形周长计算题族；增加两边记录不产生第二个独立题族。', 75, n => {
      const side = 3 + n;
      return blanks(`一个正方形边长${side}厘米。先沿两条相邻边走，再沿另外两条边回到起点，分别记录长度。`,
        [['twoEdges', '前两条边合计几厘米', side * 2], ['perimeter', '四条外边完整一圈几厘米', side * 4]],
        `前两条边是${side}+${side}=${side * 2}厘米；另外两条也一样长，四边合计${side * 4}厘米。完整周长不能只记录前半圈。`);
    });
  add('core:math:squareperimeter', 'square-grid-external-boundary', 'transfer', '从实际单位网格追踪外边界',
    '真实正方形单位格 → 一边的单位线段数 → 外边四边合计', '从网格恢复边长并只追踪外框；内部格线与内部格子数都不能加入外周长。', 90, n => {
      const edge = fixtures.squareGrids[n];
      return blanks('图中每个小方格边长1厘米，方格无空隙排成一个正方形。只沿最外边走一圈，内部格线不计入。',
        [['oneEdge', '一条外边包含几段1厘米线段', edge], ['perimeter', '最外边完整一圈几厘米', edge * 4]],
        `一条外边有${edge}段1厘米线段，四条等长外边合计${edge * 4}厘米。内部有${edge * edge}个小格，它们的个数表示覆盖，不是外边长度。`,
        [figure(`square-grid-${n}`, `正方形单位网格横向${edge}格、纵向${edge}格，每格边长1厘米；最外框加粗，内部格线较细。`)]);
    });
  add('core:math:squareperimeter', 'square-ribbon-frames-inverse', 'transfer', '从多个方框的总材料反推每条边',
    '总边条与相同方框数 → 一个方框完整周长 → 一条边', '先区分多个方框和单个方框，再逆向恢复四条等边，避免把总材料直接除4。', 100, n => {
      const frames = 2 + n % 4, side = 3 + Math.floor(n / 4) * 3 + n % 4, total = frames * side * 4;
      return blanks(`一根长${total}厘米的细条恰好围成${frames}个同样大的独立正方形框，每个框都有完整四条边，不共用边，也没有损耗或接头余量。`,
        [['framePerimeter', '每个方框完整一圈几厘米', side * 4], ['edge', '每个方框的一条边几厘米', side]],
        `总材料先平均分给${frames}个方框，一个框用${side * 4}厘米；一个正方形还有四条等边，每条${side * 4}÷4=${side}厘米。不能把所有框的总材料只分四份。`);
    });

  add('core:math:rectanglecover', 'area-unit-squares-claim', 'understanding', '把内部单位方格完整计入覆盖',
    '全部单位方格的实际排列 → 面积主张 → 核对每行与行数', '用全部实际方格核查乘积，排除把两个方向长度相加；同一排列有两种主张。', 75, n => {
      const index = Math.floor(n / 2), columns = 4 + Math.floor(index / 3), rows = 3 + index % 3;
      const claim = n % 2 ? columns + rows : columns * rows;
      return { stem: `下表每个□表示1平方厘米的小方格，全部方格无空隙、无重叠铺成一个长方形。有人把整个长方形面积记为${claim}平方厘米，记录正确吗？`,
        mode: 'boolean', answer: claim === columns * rows,
        blocks: [table(['横行', '这一行的全部单位方格'], Array.from({ length: rows }, (_, i) => [`第${i + 1}行`, '□ '.repeat(columns).trim()]))],
        analysis: `一行有${columns}个1平方厘米方格，共${rows}行，全部覆盖为${columns * rows}平方厘米。${columns}+${rows}只把两个方向的格数相加，不能数完内部方格。` };
    });
  add('core:math:rectanglecover', 'rectangle-cover', 'procedure', '记录单位覆盖的一行、行数与合计',
    '长宽 → 每行1厘米单位格与行数 → 面积', '沿用原长方形面积直接计算题族；三个空位不拆成三个独立知识样本。', 85, n => {
      const length = 5 + n, width = 2 + n % 5;
      return blanks(`长方形长${length}厘米、宽${width}厘米，用边长1厘米的正方形无空隙、无重叠铺满。沿长边排成一行，再平行排满各行。`,
        [['perRow', '每行有几个单位方格', length], ['rows', '一共几行', width], ['area', '面积几平方厘米', length * width]],
        `沿${length}厘米的长边，一行排${length}个1厘米小格，宽${width}厘米对应${width}行。总计${length * width}个单位方格，面积为${length * width}平方厘米。`);
    });
  add('core:math:rectanglecover', 'area-scattered-coverage-gaps', 'transfer', '区分完整外框面积和还需补铺的数量',
    '深浅单位格覆盖图 → 全部单位格与散布空格 → 面积和待补砖数', '缺铺位置不是从地块中挖走的洞；缺砖不改变完整长方形外框面积。', 95, n => {
      const { columns, rows, emptyCells } = fixtures.rectangleCoverage[n], total = columns * rows;
      return blanks('图中完整外框内每个小格都是1平方分米，深色格已经铺砖，白色格只是尚未铺砖。外框内全部都要铺满，不裁切、不重叠，每块砖覆盖一个小格。',
        [['completeArea', '完整外框内面积几平方分米', total], ['missingTiles', '还需要补几块砖', emptyCells.length]],
        `全部外框共${columns}列、${rows}行，面积为${total}平方分米。只有${emptyCells.length}个白格尚未铺砖，需要补${emptyCells.length}块；不能只把已铺的${total - emptyCells.length}格当完整面积。`,
        [figure(`rectangle-coverage-${n}`, `${columns}列${rows}行的完整长方形单位网格，每格1平方分米。白色未铺格位于${emptyCells.map(cell => `第${Math.floor(cell / columns) + 1}行第${cell % columns + 1}列`).join('、')}，其余格子已铺。`)]);
    });
  add('core:math:rectanglecover', 'area-recover-tiled-width', 'transfer', '从完整覆盖和每行数量恢复宽',
    '全部单位方砖与每行数量 → 相同行数 → 宽度', '从已知总覆盖反向恢复一个方向，区别于直接把两个方向相乘。', 90, n => {
      const columns = 5 + n % 4, rows = 2 + Math.floor(n / 4), total = columns * rows;
      return { stem: `用${total}块边长1分米的正方形砖，无空隙、无重叠铺成一块长方形地面。每行沿长边排${columns}块，每行数量相同。这块地面的宽是几分米？`, answer: rows,
        analysis: `每行${columns}块，要把${total}块分成相同的行，共${rows}行；每块在宽的方向占1分米，所以宽为${rows}分米。${total}是全部单位覆盖数，不能直接当作宽。` };
    });

  add('core:math:areaconvert', 'area-two-dimensional-unit-claim', 'understanding', '核对两个方向共同产生的面积进率',
    '边长相差10倍的实际网格 → 多个大面积单位 → 换算主张', '同时计入纵横两方向；同一大单位数量有正确和只乘10的错误记录。', 75, n => {
      const index = Math.floor(n / 2), unit = fixtures.areaUnitGrids[index % 2], large = 1 + index, claim = large * (n % 2 ? 10 : 100);
      return { stem: `图中展示1${unit.largeAreaUnit}的正方形如何划分为小格，每个小格是1${unit.smallAreaUnit}。同样的${large}${unit.largeAreaUnit}，有人记成${claim}${unit.smallAreaUnit}，记录正确吗？`,
        mode: 'boolean', answer: n % 2 === 0, blocks: [figure(`area-unit-${unit.id}`, `边长1${unit.largeLengthUnit}的正方形，每边是10${unit.smallLengthUnit}，横向10格、纵向10格，每格边长1${unit.smallLengthUnit}。`)],
        analysis: `每个大正方形横向10小格、纵向也10小格，是10×10=100${unit.smallAreaUnit}。${large}${unit.largeAreaUnit}等于${large * 100}${unit.smallAreaUnit}；只乘10漏掉另一个方向。` };
    });
  add('core:math:areaconvert', 'area-mixed-unit-record', 'procedure', '分别换算大单位分量和合并后的面积',
    '混合相邻面积单位 → 大单位换小单位 → 合并', '混合单位的两部分保留各自单位，包含0个大单位与0个小单位。', 85, n => {
      const unit = fixtures.areaUnitGrids[n % 2], large = n % 6, small = [37, 0, 4, 70, 9, 98, 25, 52, 60, 8, 45, 99][n];
      return blanks(`一块材料的面积记为${large}${unit.largeAreaUnit}另${small}${unit.smallAreaUnit}，统一用${unit.smallAreaUnit}记录。`,
        [['largePart', `其中大单位分量换成几${unit.smallAreaUnit}`, large * 100], ['total', `合计几${unit.smallAreaUnit}`, large * 100 + small]],
        `${large}${unit.largeAreaUnit}等于${large * 100}${unit.smallAreaUnit}，原有${small}${unit.smallAreaUnit}不用再次放大，合计为${large * 100 + small}${unit.smallAreaUnit}。零分量也要保留同一换算关系。`);
    });
  add('core:math:areaconvert', 'area-different-label-comparison', 'transfer', '比较不同单位标签对应的实际面积',
    '混合大/小单位与单一小单位的两份记录 → 统一单位 → 比较', '标签数字大小不能直接当作面积大小，分别保留甲大、乙大与等量。', 85, n => {
      const unit = fixtures.areaUnitGrids[n % 2], large = 1 + Math.floor(n / 3), small = [5, 40, 75, 99][Math.floor(n / 3)];
      const a = large * 100 + small, b = a + (n % 3 - 1) * 3, labels = ['甲的面积较大', '乙的面积较大', '两者面积相等'];
      const answer = a > b ? labels[0] : a < b ? labels[1] : labels[2];
      return choose('两块材料的面积标签如下。只按面积比较，哪个结论有依据？', answer, labels.filter(label => label !== answer),
        `甲统一为${a}${unit.smallAreaUnit}，乙为${b}${unit.smallAreaUnit}。先统一单位再比较，不能因为标签中一个数字更大就直接判断；本次${answer}。`,
        [table(['材料', '面积标签'], [['甲', `${large}${unit.largeAreaUnit}另${small}${unit.smallAreaUnit}`], ['乙', `${b}${unit.smallAreaUnit}`]])]);
    });
  add('core:math:areaconvert', 'area-covering-stock-shortfall', 'transfer', '把覆盖需求与库存统一后核对缺口',
    '大单位的覆盖目标与小单位库存 → 总需求 → 待补数量', '需求、库存和缺口是不同量；统一面积单位后再相减，不直接减两张标签数字。', 95, n => {
      const unit = fixtures.areaUnitGrids[n % 2], target = 2 + n, stocked = target * 100 - (15 + n * 3), needed = target * 100;
      return blanks(`完整覆盖一块${target}${unit.largeAreaUnit}的面板。现有贴片可以无重叠覆盖${stocked}${unit.smallAreaUnit}，每份补充贴片覆盖1${unit.smallAreaUnit}；允许沿格线拼接，不考虑裁切损耗。`,
        [['requiredSmall', `完整覆盖需要几${unit.smallAreaUnit}`, needed], ['shortfall', '还需要几份补充贴片', needed - stocked]],
        `目标${target}${unit.largeAreaUnit}换成${needed}${unit.smallAreaUnit}，现有可覆盖${stocked}${unit.smallAreaUnit}，还差${needed - stocked}${unit.smallAreaUnit}，每份补1个小单位，所以需${needed - stocked}份。`);
    });
  return result;
}
