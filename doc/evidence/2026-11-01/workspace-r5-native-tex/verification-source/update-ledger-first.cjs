const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), archive = path.join(root, 'doc/evidence/2026-11-01/workspace-r5-native-tex/receipt.json');
const receipt = JSON.parse(fs.readFileSync(archive)); if (receipt.finalEvidence.sqlite !== 'product-second' || receipt.main.checks.some(row => row.exit !== 0)) throw Error('Actual final delivery required');
const note = '2026-11-01原生公式：[178原卷TeX](178-paper-tex-native-math-and-book-boundaries.md)十一份源码已逐SHA归并；原题/选项/参考/解析复用KaTeX0.19.0转有界MathML及原生Word公式，非公式原字节、来源和原件保持。旧版实际练习册的未使用TeX参考先按原冻结输入重建，新版冷开/原命令与逐SHA下载保持全部原生记录。最终SQLite2/0/0、实际PG2/0/0、Python33/0分列；原91/0/0回归先于块公式排版修正，最终实际任务覆盖修正后渲染器。练习2页/答案1页和独立DOCX同页数，六张最终PNG均打开；先前居中缺陷、无效样本、计数/分词及锁文件保护拦截见[证据](../evidence/2026-11-01/workspace-r5-native-tex/receipt.json)。主干类型检查0，正式24/revision187保持，1062份保护文件不变；锁文件仅新增API对已有KaTeX的声明，全部依赖解析保持且未安装。应用32，无新迁移、推送或部署。矩阵/更多TeX、中文公式字体、全部题型/错题来源、全参考状态、R6～R8及原72/WS和全部真人条件继续active。';
for (const file of ['148-current-work-checkpoint-and-remaining-scope.md', '150-integrated-delivery-plan-and-work-ledger.md']) {
  const target = path.join(root, 'doc/product', file), value = fs.readFileSync(target, 'utf8'), split = value.indexOf('\n') + 1;
  if (value.includes('2026-11-01原生公式：')) throw Error('Ledger already updated');
  let output = value.slice(0, split) + '\n' + note + '\n' + value.slice(split);
  if (file.startsWith('150-')) output = output.replace('及[177声音停止](177-classroom-audio-preparation-cancellation-and-original-samples.md)已分批本地归并', '、[177声音停止](177-classroom-audio-preparation-cancellation-and-original-samples.md)及[178原生公式](178-paper-tex-native-math-and-book-boundaries.md)已分批本地归并');
  fs.writeFileSync(target, output);
}
const detail = '\n\n## 实际结果与接续\n\n十一份源码已逐SHA归入主干，三类TeX分隔符、原题/选项/答案/解析逐字段适配，KaTeX0.19.0为API显式直接依赖；全部锁定依赖条目保持，无安装命令。新增严格semantics/有界纯文本TeX注释与原生可伸缩配对括号；非法或未证明结构仍由真实逐册预检拒绝。\n\n旧成功练习册可能含未使用的TeX参考。真实上一版p179生成了这样的PDF，p180冷开后原命令/结果/意图及全部原生记录和revision保持，并由新代码按原SHA下载同一文件。新导出先转换并冻结，旧导出先比对准确原始构建，不能因新增转换让旧文件失效；来源变化仍拒绝。\n\n最终SQLite2/0/0与实际PG2/0/0分别走实际预检、四册格式任务/生成/下载、权限、无写入拒绝及冷恢复。Python33/0验证原生结构、逐册边界、段落、嵌套强调/列表缩进、空段落与参考标签。先前五文件91/0/0对应同一API转换，但早于最后块公式段落修正；不把它或重复批次合为单次全绿，也未重复完整API/整站。最终主干contracts/API/Web类型检查均0。\n\n真实逐页检查发现首版把块公式和说明/参考标签一起居中；最终独立原生公式段落保留左右正文、强调与列表续行，不留下空续段。最终PDF练习2页、答案1页，规范DOCX独立渲染同2页/1页，全部六张PNG实际打开；位置检查同时要求前后说明分行并恢复左边界。生产字体门禁与规范渲染的默认公式字体差异分列，不把后者当生产字体证明。原样本不合法命令、四分式误期望五个、PDF全角冒号分词和原视觉缺陷保留。\n\n首次主干保护检查因预期锁文件改动拦截；完整JSON核对只允许API声明已用于Web的KaTeX0.19.0，1062份其他保护文件逐摘要保持。正式库只读24/revision187、构建/配置/实际依赖未改，应用32；15451测试PG已停止，两轮原生库保留。大型原DOCX在本机QA按SHA保留，Git归档原生XML、完整分包摘要、PDF/PNG、冻结输入及源码/检查和原失败。见[完整证据](../evidence/2026-11-01/workspace-r5-native-tex/receipt.json)。\n\n尚缺矩阵/所有TeX、中文公式字体、17题型全部来源/边界、其他错题来源和全参考状态；继续R6全教材/GESP、R7/R8与原72/WS及教师/实机/新机器/实体打印/真人1/3/7/14日。原72仍11 implemented/50 in_progress/11 planned/0 verified，WS不提升，整体active；仅本地，未推送部署。\n';
const specification = path.join(root, 'doc/product/178-paper-tex-native-math-and-book-boundaries.md'); fs.writeFileSync(specification, fs.readFileSync(specification, 'utf8').trimEnd() + detail);
const requirements = path.join(root, 'doc/product/experience/requirements.md'), original = fs.readFileSync(requirements, 'utf8');
if (!original.includes('## A.')) throw Error('Original requirement sections required');
const relativeNote = note.replaceAll('](178-', '](../178-').replaceAll('](../evidence/', '](../../evidence/');
fs.writeFileSync(requirements, original.replace(/^## A\./m, relativeNote + '\n\n## A.'));
const log = path.join(root, 'doc/product/experience/implementation-log.md'); fs.writeFileSync(log, fs.readFileSync(log, 'utf8').trimEnd() + '\n\n' + relativeNote + '\n');
console.log(JSON.stringify({ updatedDocuments: 5, original72AndWsStatusesUnchanged: true, wholeGoal: 'active' }));
