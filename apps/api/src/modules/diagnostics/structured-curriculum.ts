import type { Exercise, FoundationDefinition } from './foundation-curriculum';

/** Interaction variants keep the same teaching family; a new widget is not an independent skill sample. */
export function addStructuredExercises(definitions: FoundationDefinition[]) {
  const append = (atomId: string, exercise: Exercise) => {
    const definition = definitions.find(item => item.atom.id === atomId);
    if (!definition) throw new Error(`Structured curriculum atom missing: ${atomId}`);
    definition.exercises.push(exercise);
  };
  const choice = (id: string, label: string) => ({ id, label });
  for (let n = 0; n < 8; n++) {
    const base = n + 1;
    append('core:math:compare20', { stem: `把 ${base + 8}、${base}、${base + 5}、${base + 2} 从小到大排列。`, mode: 'sorting',
      answer: ['b', 'd', 'c', 'a'], responseShape: { items: [choice('a', String(base + 8)), choice('b', String(base)), choice('c', String(base + 5)), choice('d', String(base + 2))] },
      dimension: 'understanding', family: 'compare-symbol' });
    const tens = 2 + n, units = n % 7;
    append('core:math:tensones', { stem: `${tens * 10 + units} 的十位和个位分别是多少？`, mode: 'multi_blank',
      answer: [{ key: 'tens', value: String(tens) }, { key: 'units', value: String(units) }],
      responseShape: { entries: [{ key: 'tens', label: '十位数字' }, { key: 'units', label: '个位数字' }] }, dimension: 'understanding', family: 'tens-extract' });
    const a = 4 + n, b = 6 + n;
    append('core:math:counttable', { stem: `班级借书记录${n + 1}：从表格找到两位同学的借书数，填入对应的位置。`, mode: 'table_fill',
      answer: { cells: { 'jia:books': String(a), 'yi:books': String(b) } },
      responseShape: { rows: [choice('jia', '小甲'), choice('yi', '小乙')], columns: [choice('books', '借书数（本）')] },
      blocks: [{ id: 'record', type: 'table', headers: ['同学', '借书数（本）'], rows: [['小甲', String(a)], ['小乙', String(b)], ['小丙', String(2 + n)]] }],
      dimension: 'understanding', family: 'table-second-column' });
    const acute = 25 + n * 4, obtuse = 110 + n * 3;
    append('core:math:anglekind', { stem: `把 ${acute}°、90°、${obtuse}° 的角分别放入合适类别。`, mode: 'drag_drop',
      answer: { placements: { p: 'acute', q: 'right', r: 'obtuse' } }, responseShape: {
        items: [choice('p', `${acute}°`), choice('q', '90°'), choice('r', `${obtuse}°`)],
        groups: [choice('acute', '锐角'), choice('right', '直角'), choice('obtuse', '钝角')] }, dimension: 'understanding', family: 'angle-threshold' });
    append('core:math:mixedorder', { stem: `${base}+2×4，输入等价算式或计算结果。`, mode: 'formula_blank',
      answer: `${base}+2*4`, dimension: 'procedure', family: 'product-before-add-start' });
    append('core:math:periodic', { stem: `红、黄、蓝不断重复，第 ${4 + n} 个一定是${['红', '黄', '蓝'][(n + n % 2) % 3]}色。判断这句话是否正确。`,
      mode: 'boolean', answer: n % 2 === 0, dimension: 'understanding', family: 'periodic-three' });
    const length = 4 + n, width = 2 + n % 3;
    append('core:math:rectanglecover', { stem: `一块长方形地面，每行放 ${length} 块1平方米地砖，共 ${width} 行。分步骤说明它的面积。`,
      mode: 'stepwise', answer: [`每行有${length}个1平方米`, `共有${width}行，计算${length}×${width}`, `面积是${length * width}平方米`],
      dimension: 'transfer', family: 'area-array', rubric: [
        { criterion: '正确说明每行的单位正方形数量', weight: 0.3 }, { criterion: '用行数乘每行数量并说明覆盖关系', weight: 0.4 }, { criterion: '计算正确且面积单位完整', weight: 0.3 }] });
  }
  const left = [choice('triangle', '3条直边、3个角'), choice('circle', '没有直边、没有角'), choice('square', '4条相等的边、4个直角')];
  append('core:math:planeshapes', { stem: '选择所有至少有一个角的平面图形。', mode: 'multiple_choice',
    answer: ['三角形', '正方形', '长方形'], options: ['圆', '三角形', '长方形', '正方形'], dimension: 'understanding', family: 'plane-properties' });
  append('core:math:planeshapes', { stem: '把每组边角特征与图形名称配对。', mode: 'matching',
    answer: { pairs: [{ left: 'triangle', right: 'name-triangle' }, { left: 'circle', right: 'name-circle' }, { left: 'square', right: 'name-square' }] },
    responseShape: { left, right: [choice('name-circle', '圆'), choice('name-square', '正方形'), choice('name-triangle', '三角形')] },
    dimension: 'understanding', family: 'plane-properties' });
  append('core:math:planeshapes', { stem: '观察四张图形卡，选择有4个直角、相邻两边长度不同的图形。', mode: 'hotspot', answer: 'rectangle',
    responseShape: { imageUrl: '/question-assets/plane-shapes-v1.svg', imageAlt: '四张图形卡：左上三角形、右上正方形、左下圆、右下长方形。', targets: [
      { id: 'triangle', label: '左上：3条直边、3个角', x: 0.03, y: 0.03, width: 0.44, height: 0.43 },
      { id: 'square', label: '右上：4条等长边、4个直角', x: 0.53, y: 0.03, width: 0.44, height: 0.43 },
      { id: 'circle', label: '左下：没有直边、没有角', x: 0.03, y: 0.54, width: 0.44, height: 0.43 },
      { id: 'rectangle', label: '右下：4个直角、邻边不等长', x: 0.53, y: 0.54, width: 0.44, height: 0.43 }] }, dimension: 'understanding', family: 'plane-properties' });
  append('core:math:rectanglecover', { stem: '画一个长4格、宽3格的长方形，用单位正方形表示面积；也可以用文字完整说明每行、行数和总面积。',
    mode: 'geometry_draw', answer: { description: '4个单位正方形排成一行，共3行，4×3=12个单位正方形。' },
    dimension: 'understanding', family: 'area-array', rubric: [
      { criterion: '长与宽分别对应4个和3个单位长度', weight: 0.3 }, { criterion: '单位正方形覆盖无重复、无遗漏，或文字准确说明行列', weight: 0.4 },
      { criterion: '将4×3=12与单位正方形数量联系起来', weight: 0.3 }] });
  for (let n = 0; n < 8; n++) {
    const length = 3 + n, width = 2 + n % 3;
    append('core:math:rectanglecover', { stem: `在纸上画出长${length}格、宽${width}格的长方形，用单位正方形覆盖它，并写出面积算式。拍照上传完整作答。`,
      mode: 'image_upload', answer: `每行${length}个单位正方形，共${width}行，${length}×${width}=${length * width}平方单位。`,
      responseShape: { mediaPolicy: 'student-media-v1' }, dimension: 'understanding', family: 'area-array', rubric: [
        { criterion: `图中长和宽分别对应${length}与${width}个单位长度`, weight: 0.3 },
        { criterion: '用单位正方形无重叠无遗漏地覆盖长方形，表示可辨认', weight: 0.4 },
        { criterion: `算式和图对应，面积为${length * width}平方单位`, weight: 0.3 }] });
  }
  return definitions;
}
