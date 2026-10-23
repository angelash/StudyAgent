const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const design = path.join(root, 'doc/design');
const inventory = JSON.parse(fs.readFileSync(path.join(design, 'generated/source-inventory.json'), 'utf8'));
const definitions = require('./project-feature-definitions.cjs');
const allCollections = new Set(inventory.collections.map(row => row.name));
const endpoints = inventory.endpoints.filter(row => row.active && !row.retired);
const covered = new Set(), problems = [];
const words = value => value.split(/\s+/).filter(Boolean);
const sourceLink = (file, line, up = '../../') => `[${file}${line ? ':' + line : ''}](${up}${file}${line ? '#L' + line : ''})`;
function requireFile(file) { if (!fs.existsSync(path.join(root, file))) problems.push('Missing file: ' + file); }
function handler(token, fallback) {
  const [controller, method] = token.includes('.') ? token.split('.') : [fallback, token];
  const row = endpoints.find(item => item.controller === controller && item.method === method);
  if (!row) problems.push('Missing active handler: ' + controller + '.' + method);
  return row;
}
function implementationCalls(endpoint) {
  const resolved = [];
  for (const call of endpoint.calls) {
    const tokens = call.split('.').slice(1), method = tokens.pop();
    let owner = inventory.classes.find(row => row.name === endpoint.controller);
    for (const token of tokens) {
      const dependency = owner?.dependencies.find(row => row.name === token);
      owner = dependency && inventory.classes.find(row => row.name === dependency.type);
    }
    const member = owner?.methods.find(row => row.name === method);
    if (owner && member) resolved.push({ name: owner.name + '.' + method, file: owner.file, line: member.line });
  }
  return resolved;
}
const areas = definitions.map(area => {
  for (const file of [...area.files, ...area.contracts, ...area.tests]) requireFile(file);
  for (const page of area.pages) if (!inventory.webRoutes.some(row => row.path === page && row.kind === 'page')) problems.push('Missing page: ' + page);
  const features = area.features.map(([id, title, api, collections, inputs, implementation, outputs, limits, extraFiles = []]) => {
    extraFiles.forEach(requireFile);
    const data = words(collections); for (const item of data) if (!allCollections.has(item)) problems.push('Missing collection: ' + item + ' (' + id + ')');
    const apiRows = words(api).map(token => handler(token, area.controller)).filter(Boolean);
    apiRows.forEach(row => covered.add(row.verb + ' ' + row.path));
    const calls = [...new Map(apiRows.flatMap(implementationCalls).map(row => [row.name, row])).values()];
    return { id, title, area: area.id, status: id === 'LEARN-06' ? 'historical-read-only-and-redirect' : 'current-implementation-with-stated-limits',
      actors: area.actors, pages: area.pages, inputs, implementation, outputs, collections: data, limits,
      endpoints: apiRows.map(({verb, path, controller, method, file, line}) => ({verb, path, controller, method, file, line})),
      implementations: calls, sourceFiles: [...new Set([...extraFiles, ...calls.map(row => row.file)])], tests: area.tests };
  });
  return { ...area, features };
});
const uncovered = endpoints.filter(row => !covered.has(row.verb + ' ' + row.path));
for (const endpoint of uncovered) problems.push('Uncovered endpoint: ' + endpoint.controller + '.' + endpoint.method + ' ' + endpoint.path);
const features = areas.flatMap(area => area.features);
if (new Set(features.map(row => row.id)).size !== features.length) problems.push('Duplicate feature ID');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const catalog = { schemaVersion: 1, sourceRevision: inventory.sourceRevision, scope: 'Feature-level explanations verified against active source routes. Test links are associated evidence locations, not a claim of assertion completeness.',
  counts: { areas: areas.length, features: features.length, activeNormalApiRoutes: endpoints.length, coveredApiRoutes: covered.size },
  areas: areas.map(({ id, title, actors, pages, files, contracts, tests, features }) => ({ id, title, actors, pages, files, contracts, tests, features })) };
fs.writeFileSync(path.join(design, 'feature-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const detailDirectory = path.join(design, 'details'); fs.mkdirSync(detailDirectory, { recursive: true });
for (const [index, area] of areas.entries()) {
  const lines = [`# ${String(index + 1).padStart(2, '0')} ${area.title} — 详细设计`, '',
    `源码基线：\`${inventory.sourceRevision}\`。角色：${area.actors}。`, '', `产品入口：${area.pages.map(page => '\x60' + page + '\x60').join('、')}。`, '',
    '## 模块实现', '', ...area.files.map(file => '- ' + sourceLink(file, null, '../../../')), '',
    '## 共享契约', '', ...area.contracts.map(file => '- ' + sourceLink(file, null, '../../../')), '',
    '## 关联验证', '', '以下是对应功能领域的测试入口；测试文件存在不等于每个子场景已由真人或所有设备验证。', '',
    ...area.tests.map(file => '- ' + sourceLink(file, null, '../../../')), ''];
  for (const feature of area.features) {
    lines.push(`## ${feature.id} ${feature.title}`, '', `**输入**：${feature.inputs}。`, '', '**处理与实现**：' + feature.implementation, '',
      '**输出**：' + feature.outputs + '。', '', '**状态与持久化**：' + (feature.collections.length ? feature.collections.map(value => '`' + value + '`').join('、') : '复用调用者上下文、独立索引、SQL任务表或文件资产；不另造业务集合。'), '',
      '**权限、失败与边界**：' + feature.limits, '');
    if (feature.endpoints.length) lines.push('**关联接口**：', '', ...feature.endpoints.map(row => `- \`${row.verb} ${row.path}\` → \`${row.controller}.${row.method}\`；${sourceLink(row.file, row.line, '../../../')}。`), '');
    else lines.push('**调用方式**：领域内部计算、浏览器交互或运维命令，通过上层功能触发；没有独立HTTP端点。', '');
    if (feature.implementations.length) lines.push('**服务方法**：', '', ...feature.implementations.map(row => `- \`${row.name}\`；${sourceLink(row.file, row.line, '../../../')}。`), '');
    const extraSources = feature.sourceFiles.filter(file => !feature.implementations.some(row => row.file === file));
    if (extraSources.length) lines.push('**补充实现文件**：', '', ...extraSources.map(file => '- ' + sourceLink(file, null, '../../../')), '');
  }
  fs.writeFileSync(path.join(detailDirectory, String(index + 1).padStart(2, '0') + '-' + area.id + '.md'), lines.join('\n'));
}
const framework = ['# 功能框架与实现总览', '', `代码基线：\`${inventory.sourceRevision}\`。本次整理 ${areas.length} 个领域、${features.length} 项功能，覆盖当前接入的 ${endpoints.length} 个正常HTTP路由。`, '',
  '功能以用户目标和领域处理划分，一个功能可以对应多个API；一个API也可能被多个流程复用。明确区分已实现能力、历史只读/迁移与功能边界，不以路由数量代表产品完成度。', ''];
for (const [index, area] of areas.entries()) {
  framework.push(`## ${String(index + 1).padStart(2, '0')} ${area.title}`, '', `角色：${area.actors}。入口：${area.pages.map(page => '`' + page + '`').join('、')}。`, '',
    `[逐项实现细节](details/${String(index + 1).padStart(2, '0')}-${area.id}.md)`, '');
  for (const feature of area.features) framework.push(`- **${feature.id} ${feature.title}**：${feature.outputs}。边界：${feature.limits}`);
  framework.push('');
}
fs.writeFileSync(path.join(design, '01-functional-framework.md'), framework.join('\n'));
const pageLines = ['# 页面与路由职责', '', 'Next.js App Router 静态提取。页面存在不意味着所有身份都可进入；权限由前端会话与后端Guard/领域断言共同决定。', ''];
for (const row of inventory.webRoutes) pageLines.push(`## ${row.path}`, '', `类型：${row.kind === 'page' ? '页面' : '受控HTTP处理器'}。实现：${sourceLink(row.file)}。`, '',
  '- 直接引用：' + row.imports.map(value => '`' + value + '`').join('、'), '');
fs.writeFileSync(path.join(design, 'generated/page-reference.md'), pageLines.join('\n').replaceAll('../../apps/', '../../../apps/'));
const coverage = { sourceRevision: inventory.sourceRevision, activeNormalApiRoutes: endpoints.length, coveredApiRoutes: covered.size, uncoveredApiRoutes: uncovered,
  features: features.length, areas: areas.length, sourceReferenceProblems: problems, declaredRoutes: inventory.counts.declaredHttpRoutes,
  disconnectedRoutes: inventory.endpoints.filter(row => !row.active).map(({verb,path,controller,method}) => ({verb,path,controller,method})),
  retiredRoutes: inventory.endpoints.filter(row => row.active && row.retired).map(({verb,path}) => ({verb,path})),
  sourceInventory: 'generated/source-inventory.json', featureCatalog: 'feature-catalog.json' };
fs.writeFileSync(path.join(design, 'generated/coverage.json'), JSON.stringify(coverage, null, 2) + '\n');
const template = fs.readFileSync(path.join(__dirname, 'project-design-viewer.html'), 'utf8');
const embeddedCatalog = JSON.stringify(catalog).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
fs.writeFileSync(path.join(design, 'index.html'), template.replace('__PROJECT_DESIGN_CATALOG__', () => embeddedCatalog));
console.log(JSON.stringify(catalog.counts, null, 2));
