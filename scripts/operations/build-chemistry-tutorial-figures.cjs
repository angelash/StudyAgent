/* Original, deterministic scientific SVGs. No publisher artwork or external fonts. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), target = path.join(root, 'apps/web/public/classroom/chemistry-v2');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const ink = '#2e4339', green = '#4f8064', red = '#d56449', blue = '#7399af', gold = '#d9bd78';
const text = (x, y, s, size = 21, color = ink, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
const line = (x, y, a, b, color = '#829688', dash = '') => `<path d="M${x},${y}L${a},${b}" fill="none" stroke="${color}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const arrow = (x, y, a, b) => line(x, y, a, b, green) + `<path d="M${a - 9},${b - 7}L${a},${b}L${a - 9},${b + 7}" fill="none" stroke="${green}" stroke-width="3"/>`;
const box = (x, y, w, h, color = '#edf2e9', dash = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${color}" stroke="#c6d3c3" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const atom = (e, x, y, r = e === 'H' ? 15 : 21) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${({ H: '#f4e3ae', O: red, C: '#4a5860', N: blue })[e]}" stroke="${ink}"/>` + text(x, y + 6, e, 18, ['C', 'O'].includes(e) ? '#fff' : ink, 'middle');
const water = (x, y) => line(x - 29, y + 18, x, y) + line(x, y, x + 29, y + 18) + atom('O', x, y) + atom('H', x - 29, y + 18) + atom('H', x + 29, y + 18);
const pair = (e, x, y) => line(x - 18, y, x + 18, y) + atom(e, x - 18, y) + atom(e, x + 18, y);
const co = (x, y, dioxide) => line(x, y, x + 45, y) + atom('C', x, y) + atom('O', x + 45, y) + (dioxide ? line(x, y, x - 45, y) + atom('O', x - 45, y) : '');
const widthUnits = s => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : .57), 0);
const labelBox = (x, y, w, h, title, detail, color) => box(x, y, w, h, color) + text(x + 18, y + 35, title, Math.min(25, (w - 36) / widthUnits(title))) + text(x + 18, y + 70, detail, Math.min(18, (w - 36) / widthUnits(detail)));
const beaker = (x, y, w, h, fill = '#d9e9e6') => `<path d="M${x},${y}V${y + h}H${x + w}V${y}" fill="none" stroke="${ink}" stroke-width="3"/><rect x="${x + 3}" y="${y + h * .5}" width="${w - 6}" height="${h * .5 - 3}" fill="${fill}"/>`;
const scene = {};
scene.changes = () => text(45, 120, '汽化：分子种类不变') + box(35, 145, 330, 100) + water(130, 185) + water(245, 185) + arrow(390, 195, 480, 195) + water(560, 160) + water(750, 215) +
  text(45, 305, '分解：原子重新组合') + water(130, 355) + water(245, 355) + arrow(390, 365, 480, 365) + pair('H', 555, 335) + pair('H', 750, 335) + pair('O', 650, 390) + text(475, 435, '2H₂O → 2H₂ + O₂（通电）', 21);
scene.properties = () => labelBox(45, 140, 335, 120, '铜能导电', '物理性质：不以生成新物质为前提') + arrow(395, 200, 465, 200) + labelBox(490, 140, 335, 120, '一次通电过程', '性质描述“能怎样”') +
  labelBox(45, 300, 335, 120, '酒精能燃烧', '化学性质：需在化学变化中表现', '#f5ebdb') + arrow(395, 360, 465, 360) + labelBox(490, 300, 335, 120, '酒精正在燃烧', '变化描述“发生了什么”', '#f5ebdb');
scene.lab = () => {
  let s = `<path d="M295,125V400H465V125" fill="none" stroke="${ink}" stroke-width="3"/><path d="M298,260Q380,290,462,260V397H298Z" fill="#d8e9e5"/>`;
  for (let i = 0; i < 9; i++) s += line(430, 140 + i * 28, 465, 140 + i * 28) + text(420, 147 + i * 28, String(90 - i * 10), 16, ink, 'end');
  s += line(380, 275, 750, 275, green, '7 5') + text(590, 255, '平视最低处', 23, green) + line(380, 275, 750, 135, red) + text(650, 125, '俯视：偏大', 21, red) + line(380, 275, 750, 410, red) + text(650, 440, '仰视：偏小', 21, red);
  return s + text(45, 180, '量筒放平', 22) + text(45, 215, '实际液体不因', 20) + text(45, 245, '视线改变而增减', 20);
};
scene.variables = () => beaker(110, 155, 210, 190) + beaker(560, 155, 210, 190) + text(215, 125, '甲：20℃', 25, ink, 'middle') + text(665, 125, '乙：60℃', 25, ink, 'middle') +
  text(215, 390, '等量水、等量同颗粒糖', 22, ink, 'middle') + text(665, 390, '搅拌方式等其他条件相同', 22, ink, 'middle') + text(440, 450, '本次只研究：温度的影响', 27, green, 'middle');
scene.air = () => {
  let s = '';
  for (let i = 0; i < 100; i++) s += `<rect x="${55 + i % 20 * 26}" y="${145 + Math.floor(i / 20) * 37}" width="21" height="30" rx="3" fill="${i < 78 ? blue : i < 99 ? red : gold}"/>`;
  return s + text(625, 180, 'N₂ 约78%', 28, blue) + text(625, 235, 'O₂ 约21%', 28, red) + text(625, 290, '其他约1%', 28, '#9a7c34') + text(55, 405, '这里比较的是体积，不是质量。', 27) + text(55, 445, '剩余气体不是纯氮气；组成可随环境条件变化。', 22);
};
scene.oxygen = () => box(45, 125, 340, 270) + pair('O', 210, 200) + text(210, 285, '氧气：助燃', 29, ink, 'middle') + text(210, 330, '不能当作普通燃料', 22, ink, 'middle') + arrow(405, 255, 480, 255) +
  box(500, 125, 330, 270, '#f6ecda') + `<path d="M580,330l135,-100" stroke="#9e7846" stroke-width="15"/><circle cx="715" cy="230" r="16" fill="#d4834b"/>` + text(665, 165, '带火星的木条复燃', 25, ink, 'middle') + text(665, 375, '可燃物是木条', 23, ink, 'middle');
scene['oxygen-preparation'] = () => labelBox(40, 150, 240, 150, '发生', 'H₂O₂溶液 + MnO₂') + text(60, 270, '不另行加热', 22, green) + arrow(295, 225, 335, 225) + labelBox(350, 150, 220, 150, '收集', '可用排水法') +
  arrow(585, 225, 625, 225) + labelBox(640, 150, 205, 150, '检验', '带火星木条复燃') + text(440, 370, '2H₂O₂ → 2H₂O + O₂↑（MnO₂催化）', 28, ink, 'middle') + text(440, 425, '先依据条件选装置，再依据性质选收集方法。', 22, green, 'middle');
scene.catalyst = () => `<path d="M105,110V380H790" fill="none" stroke="${ink}" stroke-width="3"/><path d="M105,370L280,170H770" fill="none" stroke="${green}" stroke-width="5"/><path d="M105,370L770,170" fill="none" stroke="#b08b44" stroke-width="5"/>` +
  text(85, 90, '相对产气量', 23) + text(660, 420, '示意时间 →', 23) + text(355, 150, '理论最终量相同', 26, green) + text(300, 230, '适当催化剂：更快', 24, green) + text(390, 350, '未加催化剂：较慢', 24, '#9a7531');
scene.particles = () => box(40, 150, 330, 230) + water(135, 245) + water(260, 245) + text(205, 125, '液态：间隔较小', 25, ink, 'middle') + arrow(395, 260, 475, 260) + box(500, 150, 330, 230, '#f6ecdc') + water(570, 195) + water(755, 325) + text(665, 125, '气态：间隔通常较大', 25, ink, 'middle') + text(440, 445, '两侧均为水分子，分子自身没有随间隔一起变大。', 25, ink, 'middle');
function sodium(ion) {
  let s = '';
  for (const r of [48, 88, ...(ion ? [] : [125])]) s += `<circle cx="${ion ? 635 : 220}" cy="265" r="${r}" fill="none" stroke="#b2c2af"/>`;
  const cx = ion ? 635 : 220;
  s += `<circle cx="${cx}" cy="265" r="30" fill="#e4c5a1"/>` + text(cx, 270, '11p⁺', 19, ink, 'middle');
  [2, 8, ion ? 0 : 1].forEach((n, shell) => { for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n, r = [48, 88, 125][shell]; s += `<circle cx="${cx + Math.cos(a) * r}" cy="${265 + Math.sin(a) * r}" r="5" fill="${green}"/>`; } });
  return s;
}
scene.atoms = () => sodium(false) + text(220, 110, 'Na原子：2、8、1', 27, ink, 'middle') + labelBox(440, 150, 370, 95, '核内：11个质子', '中子不带电；质量主要集中在核内') +
  labelBox(440, 275, 370, 95, '核外：11个电子', '正负电荷相抵，整体不带电') + text(440, 445, '电子层是简化表达，不是真实电子轨道。', 23, ink, 'middle');
scene.ions = () => sodium(false) + sodium(true) + arrow(380, 265, 455, 265) + text(220, 110, 'Na：11p⁺、11e⁻', 27, ink, 'middle') + text(635, 110, 'Na⁺：11p⁺、10e⁻', 27, ink, 'middle') + text(440, 220, '失去e⁻', 22, green, 'middle') + text(440, 445, '质子数不变，元素种类不变；净电荷从0变为+1。', 25, ink, 'middle');
scene.elements = () => labelBox(55, 145, 340, 195, '¹²C', '6个质子 + 6个中子') + labelBox(485, 145, 340, 195, '¹³C', '6个质子 + 7个中子') + atom('C', 225, 280, 32) + atom('C', 655, 280, 32) +
  text(440, 405, '质子数相同 → 同属碳元素', 29, green, 'middle') + text(440, 445, '中子数不同，不改变元素种类。', 24, ink, 'middle');
scene.purification = () => {
  let s = beaker(65, 155, 215, 235) + `<path d="M430,130H800L615,280V330" fill="none" stroke="${ink}" stroke-width="3"/><path d="M470,150H760L615,260Z" fill="#e9debf"/>` + beaker(505, 325, 220, 110);
  for (let i = 0; i < 6; i++) s += `<rect x="${100 + i % 3 * 57}" y="${250 + Math.floor(i / 3) * 65}" width="12" height="12" fill="#71614a"/><circle cx="${100 + i % 3 * 57}" cy="${285 + Math.floor(i / 3) * 65}" r="5" fill="${blue}"/><rect x="${560 + i % 3 * 35}" y="${185 + Math.floor(i / 3) * 18}" width="12" height="12" fill="#71614a"/><circle cx="${535 + i * 31}" cy="${390 + i % 2 * 25}" r="5" fill="${blue}"/>`;
  return s + arrow(310, 265, 385, 265) + text(170, 125, '原水：两类杂质', 24, ink, 'middle') + text(610, 110, '滤纸截留不溶颗粒', 24, ink, 'middle') + text(60, 470, '■ 不溶颗粒　● 溶解物（仍在滤液中）', 25);
};
scene.water = () => box(70, 140, 300, 220) + box(510, 140, 300, 220, '#f6ecdc') + pair('H', 170, 220) + pair('H', 285, 220) + pair('O', 660, 220) + text(220, 115, '阴极（−）：H₂', 28, ink, 'middle') + text(660, 115, '阳极（+）：O₂', 28, ink, 'middle') +
  text(220, 315, '体积约2份', 26, ink, 'middle') + text(660, 315, '体积约1份', 26, ink, 'middle') + text(440, 415, '体积比2∶1　≠　质量比1∶8', 31, green, 'middle') + text(440, 455, '同温同压；气体粒子数为示意。', 22, ink, 'middle');
scene.valence = () => labelBox(50, 150, 345, 165, 'Al：+3价 × 2', '总和 +6') + labelBox(485, 150, 345, 165, 'O：−2价 × 3', '总和 −6') + text(440, 255, '+', 35, ink, 'middle') +
  text(440, 385, '2×(+3) + 3×(−2) = 0', 32, green, 'middle') + text(440, 445, '最简组成比2∶3 → Al₂O₃', 32, ink, 'middle');
scene['formula-mass'] = () => text(440, 160, 'Ca(OH)₂', 65, ink, 'middle') + line(340, 185, 220, 250) + line(440, 185, 440, 250) + line(540, 185, 660, 250) +
  labelBox(65, 265, 220, 95, '1个Ca', '1×40 = 40') + labelBox(330, 265, 220, 95, '2个O', '2×16 = 32') + labelBox(595, 265, 220, 95, '2个H', '2×1 = 2') + text(440, 440, '40 + 32 + 2 = 74（不带g单位）', 31, green, 'middle');
scene.conservation = () => box(40, 145, 340, 230, '#edf2e9', '8 5') + co(210, 245, true) + text(210, 330, '称量范围内的CO₂', 23, ink, 'middle') + arrow(400, 250, 485, 250) + box(510, 145, 330, 230, '#f6ecdc') + co(675, 245, true) + text(675, 330, '逸出范围的CO₂', 23, ink, 'middle') +
  text(440, 420, '剩余质量 + 逸出质量 = 反应前总质量', 29, green, 'middle') + text(440, 465, '不能把逸出气体从生成物总质量中漏掉。', 23, ink, 'middle');
scene.balance = () => pair('H', 100, 210) + pair('H', 220, 210) + text(310, 215, '+', 35) + pair('O', 390, 210) + arrow(460, 210, 535, 210) + water(620, 210) + water(760, 210) +
  text(440, 135, '2H₂ + O₂ → 2H₂O（点燃）', 39, ink, 'middle') + text(225, 330, '左侧：H 4个、O 2个', 27, ink, 'middle') + text(660, 330, '右侧：H 4个、O 2个', 27, ink, 'middle') + text(440, 425, '只改系数，不能把H₂O改成H₂O₂。', 29, green, 'middle');
scene.stoichiometry = () => text(440, 140, '2H₂ + O₂ → 2H₂O', 43, ink, 'middle') + text(440, 180, '适用反应条件：点燃', 20, ink, 'middle') + labelBox(50, 230, 225, 115, '2×2 = 4', '氢气的相对质量') + labelBox(327, 230, 225, 115, '1×32 = 32', '氧气的相对质量') + labelBox(604, 230, 225, 115, '2×18 = 36', '水的相对质量') +
  text(440, 425, '粒子数比2∶1∶2 → 质量比4∶32∶36', 31, green, 'middle');
scene.purity = () => `<rect x="60" y="190" width="608" height="105" rx="5" fill="${green}"/><rect x="668" y="190" width="152" height="105" rx="5" fill="#d3c8b0"/>` +
  text(365, 250, '有效成分：80 g', 30, '#fff', 'middle') + text(745, 250, '20 g', 27, ink, 'middle') + text(440, 140, '100 g样品，纯度80%', 31, ink, 'middle') + text(700, 335, '不参与反应的杂质', 20, ink, 'middle') + text(440, 425, '先换算纯物质质量，再代入反应比例。', 29, green, 'middle');
scene.carbon = () => {
  let s = box(40, 135, 345, 250) + box(490, 135, 345, 250, '#f6ecdc');
  for (const [i, [x, y]] of [[150, 185], [295, 200], [130, 340], [300, 335]].entries()) s += (i === 2 ? line(220, 265, x, y, '#829688', '6 5') : i === 3 ? `<path d="M220,265L${x - 7},${y + 5}L${x + 7},${y - 5}Z" fill="#829688"/>` : line(220, 265, x, y)) + atom('C', x, y, 14);
  s += atom('C', 220, 265, 20);
  for (const cy of [220, 325]) {
    const vertices = Array.from({ length: 6 }, (_, i) => [660 + Math.cos(i * Math.PI / 3) * 90, cy + Math.sin(i * Math.PI / 3) * 38]);
    s += `<path d="M${vertices.map(v => v.join(',')).join('L')}Z" fill="none" stroke="${ink}" stroke-width="3"/>`;
    for (const [x, y] of vertices) s += atom('C', x, y, 10);
  }
  return s + text(210, 112, '金刚石：空间连接', 26, ink, 'middle') + text(660, 112, '石墨：层状排列', 26, ink, 'middle') + text(440, 450, '连接方式示意，不是按比例的完整晶体结构。', 24, green, 'middle');
};
scene['carbon-dioxide-preparation'] = () => {
  const apparatus = `<path d="M170,150v70l-70,150q-8,25,25,25h190q33,0,25,-25l-70,-150v-70" fill="#edf1e9" stroke="${ink}" stroke-width="3"/><rect x="168" y="145" width="105" height="15" fill="#ac9270"/><path d="M585,190V400H770V190" fill="#faf5e9" stroke="${ink}" stroke-width="3"/><path d="M240,190V100H665V355" fill="none" stroke="${green}" stroke-width="7"/><path d="M680,345V220M745,220V135" fill="none" stroke="${blue}" stroke-width="2" stroke-dasharray="6 5"/>`;
  return apparatus + text(75, 445, '发生瓶：石灰石 + 稀盐酸', 23) + text(575, 445, '收集瓶直立，进气至底部', 23) + text(750, 112, '空气排出', 19, blue, 'middle') + text(300, 330, 'CO₂', 25, green) + text(615, 355, 'CO₂', 25, green);
};
scene['carbon-dioxide'] = () => labelBox(40, 150, 250, 160, '干燥石蕊 + 干CO₂', '通常不变红') + labelBox(315, 150, 250, 160, '湿润石蕊 + CO₂', '可变红：水参与反应', '#f3dfe1') + labelBox(590, 150, 250, 160, '澄清石灰水 + CO₂', '少量CO₂：白色浑浊', '#f3f0e4') +
  text(440, 385, 'CO₂ + H₂O → H₂CO₃', 27, ink, 'middle') + text(440, 435, 'CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O', 27, green, 'middle');
scene['carbon-monoxide'] = () => box(50, 135, 345, 265) + co(200, 225, false) + text(220, 165, 'CO', 34, ink, 'middle') + text(220, 325, '有毒、可燃、有还原性', 24, ink, 'middle') +
  box(485, 135, 345, 265, '#f6ecdc') + co(660, 225, true) + text(660, 165, 'CO₂', 34, ink, 'middle') + text(660, 325, '通常不支持燃烧', 24, ink, 'middle') + text(440, 455, '组成接近不能推出性质相同，也不能靠闻气味排除CO。', 23, green, 'middle');
scene.combustion = () => `<path d="M440,135L190,380H690Z" fill="#f5ead5" stroke="#a9b9a7" stroke-width="4"/>` + text(440, 115, '可燃物', 28, ink, 'middle') + text(175, 425, '氧气（或空气）', 26, ink, 'middle') + text(690, 425, '达到着火点', 26, ink, 'middle') + text(440, 295, '同时满足', 32, green, 'middle') + text(440, 340, '常见燃烧条件模型', 22, ink, 'middle');
scene.extinguishing = () => labelBox(45, 155, 245, 185, '移走可燃物', '切断可燃物条件') + labelBox(318, 155, 245, 185, '隔绝氧气', '切断助燃条件', '#f6ecdc') + labelBox(590, 155, 245, 185, '降温', '降到着火点以下') + text(440, 420, '冷却改变温度，不是降低物质的着火点。', 29, green, 'middle') + text(440, 460, '具体火情的处理方法不能由单一条件图直接决定。', 22, ink, 'middle');
scene.environment = () => labelBox(45, 125, 315, 80, 'CO₂', '排放与温室效应增强有关') + labelBox(45, 230, 315, 80, 'CO', '有毒；含碳燃料不完全燃烧可产生') + labelBox(45, 335, 315, 80, 'SO₂、颗粒物等', '分别关注酸雨、空气质量等') +
  arrow(385, 165, 475, 165) + arrow(385, 270, 475, 270) + arrow(385, 375, 475, 375) + labelBox(500, 125, 335, 80, '节能、低碳能源', '核算各环节碳排放') + labelBox(500, 230, 335, 80, '燃烧条件与通风', '不以无气味证明安全') + labelBox(500, 335, 335, 80, '净化与治理', '按具体排放物选择措施');
scene.hydrogen = () => labelBox(45, 155, 230, 130, '制氢', '能源来源？') + arrow(290, 220, 325, 220) + labelBox(340, 155, 205, 130, '储运', '能耗与条件？') + arrow(560, 220, 595, 220) + labelBox(610, 155, 225, 130, '使用', '氢氧反应生成水') +
  text(440, 370, '2H₂ + O₂ → 2H₂O（适用条件下）', 30, ink, 'middle') + text(440, 430, '一个环节生成水 ≠ 全流程必定零排放', 30, green, 'middle');
const titles = {
  changes: '水的状态变化与分解', properties: '性质与变化', lab: '量筒：平视凹液面最低处', variables: '对照实验与变量', air: '空气的体积组成', oxygen: '助燃与可燃', 'oxygen-preparation': '制氧：发生、收集、检验', catalyst: '催化：速率与最终量', particles: '分子种类与间隔', atoms: '原子核与核外电子', ions: '原子与离子', elements: '元素分类看质子数', purification: '过滤与溶解物', water: '水的组成：比较不同的比值', valence: '化合价与组成比', 'formula-mass': '括号、下标与相对质量', conservation: '质量守恒与系统边界', balance: '方程式配平与原子计数', stoichiometry: '从系数比到质量比', purity: '纯度与有效反应物', carbon: '碳的不同结构', 'carbon-dioxide-preparation': 'CO₂制取与收集原理简图', 'carbon-dioxide': 'CO₂的性质与证据', 'carbon-monoxide': 'CO和CO₂的比较', combustion: '燃烧的三个条件', extinguishing: '灭火的原理', environment: '排放物与环境影响', hydrogen: '氢能：反应与评估边界',
};
fs.mkdirSync(target, { recursive: true });
const figures = Object.entries(titles).map(([code, title]) => {
  if (!scene[code]) throw Error('Missing science scene: ' + code);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="520" viewBox="0 0 880 520" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">原创教学示意图；颜色区分物质或元素，不按真实尺寸比例。相关条件与解释见本课正文。</desc><rect width="880" height="520" fill="#fffdf7"/><g font-family="system-ui, sans-serif" fill="${ink}">${text(40, 55, title, 30)}${line(40, 78, 840, 78, '#dce3d5')}${scene[code]()}${text(40, 505, 'StudyAgent · 原创化学图示 · 模型不代替真实实验', 14, '#748472')}</g></svg>\n`;
  const destination = path.join(target, code + '.svg'); fs.writeFileSync(destination, svg);
  return { code, title, href: `/classroom/chemistry-v2/${code}.svg`, sha256: crypto.createHash('sha256').update(svg).digest('hex') };
});
fs.writeFileSync(path.join(root, 'resources/curriculum/chemistry-tutorial-figures-v2.json'), JSON.stringify({ version: 'chemistry-tutorial-figures-v2', provenance: 'Original deterministic SVG; scientific facts and simplified models, no copied textbook illustrations.', count: figures.length, figures }, null, 2) + '\n');
console.log(JSON.stringify({ figures: figures.length, directory: path.relative(root, target) }));
