/* Static implementation inventory. No user database, .env, or credentials are read. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'doc/design/generated');
const relative = value => path.relative(root, value).replaceAll('\\', '/');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
function decorators(node, source) {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []).map(item => ({
    name: ts.isCallExpression(item.expression) ? item.expression.expression.getText(source) : item.expression.getText(source),
    args: ts.isCallExpression(item.expression) ? item.expression.arguments.map(argument => argument.getText(source)) : [],
  }));
}
function literal(value = '') { return /^['"`][^$]*['"`]$/.test(value) ? value.slice(1, -1) : value; }
function signature(node, source) {
  return `${node.name?.getText(source) ?? 'anonymous'}(${node.parameters.map(parameter => parameter.getText(source).replace(/\s+/g, ' ')).join(', ')})${node.type ? ': ' + node.type.getText(source) : ''}`;
}
function calls(node, source) {
  const result = new Set();
  function visit(item) {
    if (ts.isCallExpression(item) && ts.isPropertyAccessExpression(item.expression) && /^this(?:\.[A-Za-z_$][\w$]*)+$/.test(item.expression.getText(source))) result.add(item.expression.getText(source));
    ts.forEachChild(item, visit);
  }
  visit(node); return [...result];
}
const sourceFiles = files(path.join(root, 'apps/api/src')).filter(file => !/\.test\.ts$/.test(file));
const endpoints = [], classes = [], functions = [], collections = [], contractTypes = [], webRoutes = [], modules = [];
for (const file of sourceFiles) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  source.forEachChild(node => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.push({ file: relative(file), name: node.name.text, line: line(node), signature: signature(node, source) });
    if (!ts.isClassDeclaration(node)) return;
    const annotations = decorators(node, source), base = literal(annotations.find(item => item.name === 'Controller')?.args[0] ?? '');
    const constructor = node.members.find(ts.isConstructorDeclaration);
    const methods = node.members.filter(ts.isMethodDeclaration).map(method => ({
      name: method.name.getText(source), line: line(method), signature: signature(method, source),
      access: method.modifiers?.find(item => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(item.kind))?.getText(source) ?? 'public',
      decorators: decorators(method, source), calls: calls(method, source),
    }));
    const record = { name: node.name?.text, file: relative(file), line: line(node), decorators: annotations,
      dependencies: constructor?.parameters.map(item => ({ name: item.name.getText(source), type: item.type?.getText(source) ?? 'unknown' })) ?? [], methods };
    classes.push(record);
    const moduleDecorator = (ts.getDecorators(node) ?? []).find(item => ts.isCallExpression(item.expression) && item.expression.expression.getText(source) === 'Module');
    if (moduleDecorator) {
      const properties = moduleDecorator.expression.arguments[0]?.properties ?? [];
      const array = name => { const property = properties.find(item => item.name?.getText(source) === name); return property && ts.isArrayLiteralExpression(property.initializer) ? property.initializer.elements.map(item => item.getText(source)) : []; };
      modules.push({ name: record.name, file: record.file, imports: array('imports'), controllers: array('controllers'), providers: array('providers'), exports: array('exports') });
    }
    for (const method of methods) {
      const route = method.decorators.find(item => ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All'].includes(item.name));
      if (!route) continue;
      const paths = route.name === 'All' ? [...(route.args[0] ?? '').matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]) : [literal(route.args[0] ?? '')];
      for (const suffix of paths) endpoints.push({ verb: route.name.toUpperCase(), path: '/api/' + [base, suffix].filter(Boolean).join('/'),
        controller: record.name, method: method.name, file: record.file, line: method.line, signature: method.signature,
        classDecorators: annotations.filter(item => item.name !== 'Controller'), decorators: method.decorators.filter(item => item.name !== route.name),
        dependencies: record.dependencies, calls: method.calls });
    }
    if (node.name?.text === 'InMemoryStoreService') for (const property of node.members.filter(ts.isPropertyDeclaration)) {
      const element = property.type && (ts.isArrayTypeNode(property.type) ? property.type.elementType :
        ts.isTypeReferenceNode(property.type) && property.type.typeName.getText(source) === 'Array' ? property.type.typeArguments?.[0] : null);
      if (element) collections.push({ name: property.name.getText(source), type: element.getText(source).replace(/\s+/g, ' '), file: record.file, line: line(property) });
    }
  });
}
for (const file of files(path.join(root, 'packages/contracts/src'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  source.forEachChild(node => {
    if (!(ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node))) return;
    const body = ts.isTypeAliasDeclaration(node) ? node.type : node;
    const members = body.members ?? [];
    contractTypes.push({ name: node.name.text, file: relative(file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      kind: ts.SyntaxKind[node.kind], fields: [...members].filter(ts.isPropertySignature).map(member => ({ name: member.name.getText(source), optional: Boolean(member.questionToken), type: member.type?.getText(source) ?? 'unknown' })) });
  });
}
for (const file of files(path.join(root, 'apps/web/app')).filter(file => file.endsWith(path.sep + 'page.tsx') || file.endsWith(path.sep + 'route.ts'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  webRoutes.push({ path: '/' + relative(path.dirname(file)).replace('apps/web/app', '').replace(/^\//, ''), kind: file.endsWith('page.tsx') ? 'page' : 'route-handler', file: relative(file),
    imports: source.statements.filter(ts.isImportDeclaration).map(item => literal(item.moduleSpecifier.getText(source))) });
}
const tests = files(path.join(root, 'apps/api/src')).filter(file => file.endsWith('.test.ts')).map(relative);
const e2eTests = files(path.join(root, 'tests/e2e')).filter(file => file.endsWith('.spec.ts')).map(relative);
const activeModules = new Set();
function activate(name) { if (activeModules.has(name)) return; activeModules.add(name); for (const dependency of modules.find(item => item.name === name)?.imports ?? []) activate(dependency); }
activate('AppModule');
const activeControllers = new Set(modules.filter(item => activeModules.has(item.name)).flatMap(item => item.controllers));
for (const endpoint of endpoints) { endpoint.active = activeControllers.has(endpoint.controller); endpoint.retired = endpoint.controller === 'RetiredLearningController'; }
const inventory = { schemaVersion: 1, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  scope: 'Static source inventory; route presence does not prove feature completion or runtime permission.',
  counts: { declaredHttpRoutes: endpoints.length, activeHttpRoutes: endpoints.filter(row => row.active).length,
    activeBusinessHttpRoutes: endpoints.filter(row => row.active && !row.retired).length, retiredHttpRoutes: endpoints.filter(row => row.active && row.retired).length,
    activeModules: activeModules.size, activeControllers: activeControllers.size, apiClasses: classes.length, apiFunctions: functions.length, domainCollections: collections.length, contractTypes: contractTypes.length,
    webPages: webRoutes.filter(row => row.kind === 'page').length, webRouteHandlers: webRoutes.filter(row => row.kind !== 'page').length, apiTestFiles: tests.length, browserTestFiles: e2eTests.length },
  modules: modules.map(row => ({ ...row, active: activeModules.has(row.name) })), endpoints, classes, functions, collections, contractTypes, webRoutes, tests, e2eTests };
const encode = value => JSON.stringify(value, null, 2) + '\n';
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'source-inventory.json'), encode(inventory));
const link = (file, line) => `[${file}${line ? ':' + line : ''}](../../../${file}${line ? '#L' + line : ''})`;
const lines = ['# HTTP 接口实现索引', '', `源码基线：\`${inventory.sourceRevision}\`。共 ${endpoints.length} 个 HTTP 路由声明，当前 AppModule 可达 ${inventory.counts.activeBusinessHttpRoutes} 个正常路由、${inventory.counts.retiredHttpRoutes} 个返回410的旧协议拦截路由；正常路由包含健康和运维接口。`, '',
  '本表从 Nest 装饰器与处理方法自动提取。参数签名不是完整请求 Schema；权限以身份 Guard 与服务层的学生/监护/内容审核断言共同决定。StreamableFile、Cookie、重定向等响应不应被当成普通 JSON。具体业务与校验见对应领域详细设计。', ''];
for (const controller of [...new Set(endpoints.map(row => row.controller))]) {
  const first = endpoints.find(row => row.controller === controller);
  lines.push(`## ${controller} — ${first.active ? first.retired ? '已接入，旧协议返回410' : '当前接入' : '历史代码，未被AppModule接入'}`, '');
  for (const row of endpoints.filter(row => row.controller === controller)) lines.push(`### ${row.verb} ${row.path}`, '', `实现：${link(row.file, row.line)}，方法 \`${row.method}\`。`, '',
    '- 签名：`' + row.signature.replaceAll('`', '\\`') + '`',
    '- 控制器装饰器：`' + JSON.stringify(row.classDecorators) + '`',
    '- 方法装饰器：`' + JSON.stringify(row.decorators) + '`',
    '- 调用：' + (row.calls.map(call => '`' + call + '`').join('、') || '无 this 服务调用；直接处理或静态函数。'), '');
}
fs.writeFileSync(path.join(output, 'api-reference.md'), lines.join('\n'));
const entities = ['# 领域集合与契约索引', '', `源码基线：\`${inventory.sourceRevision}\`。这些是领域文档集合，并不代表每个集合对应一张独立 SQL 表。`, '', '## 领域集合', ''];
for (const row of collections) entities.push(`- \`${row.name}\` → \`${row.type}\`；${link(row.file, row.line)}。`);
entities.push('', '## 共享数据契约', '');
for (const file of [...new Set(contractTypes.map(row => row.file))]) {
  entities.push(`### ${file}`, '');
  for (const row of contractTypes.filter(row => row.file === file)) entities.push(`- \`${row.name}\`：${link(file, row.line)}${row.fields.length ? '；字段：' + row.fields.map(field => '`' + field.name + (field.optional ? '?' : '') + '`').join('、') : '；别名、联合类型或 Zod 推导类型，具体约束查看源码'}。`);
  entities.push('');
}
fs.writeFileSync(path.join(output, 'data-reference.md'), entities.join('\n'));
console.log(JSON.stringify({ sourceRevision: inventory.sourceRevision, counts: inventory.counts }, null, 2));
