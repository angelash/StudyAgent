// Adapt only the captured sidebar styles; keep the original stylesheet unchanged.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const postcss = require('postcss');
const root = path.resolve(__dirname, '../..');
const source = 'apps/web/public/reference/hyperknow/assets/css/index-CkZwjgwy.css';
const expectedSource = 'cce6185b6293280df5c484044f310272f32297afd40a71527e842a9fd57f0183';
const target = 'apps/web/app/studio/reference-navigation.generated.css';
const inventory = 'apps/web/app/studio/reference-navigation-source.json';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(root, source)); assert.equal(hash(bytes), expectedSource, 'Captured source identity changed');
const parsed = postcss.parse(bytes.toString('utf8')), output = postcss.root();
const scope = '.ws-reference-navigation';
const start = bytes.toString('utf8').indexOf('.sidebar{'); assert(start > 0);
const families = /\.(?:sidebar(?:-[\w-]+)?|nav-icons-group|nav-item(?:-[\w-]+)?|collapse-icon|button-label|history-sections-container|activities-section|conversation-(?:list|item|title)|chevron-icon|tooltip)(?=[\s.:[#>,+~]|$)/;
const rows = [], animations = new Map();
parsed.walkAtRules(/keyframes$/, rule => animations.set(rule.params, rule));
const usedAnimations = new Set();
function scoped(selector) {
  return selector.startsWith('.sidebar') && !selector.startsWith('.sidebar-')
    ? selector.replace(/^\.sidebar(?=[\s.:[#>,+~]|$)/, scope + '.sidebar') : scope + ' ' + selector;
}
function append(rule, clone) {
  const chain = []; let parent = rule.parent;
  while (parent && parent.type !== 'root') {
    assert.equal(parent.type, 'atrule', 'Unexpected nested source selector');
    assert(!/keyframes$/.test(parent.name)); chain.unshift(parent); parent = parent.parent;
  }
  let container = output;
  for (const entry of chain) { const wrapper = postcss.atRule({ name: entry.name, params: entry.params }); container.append(wrapper); container = wrapper; }
  container.append(clone);
}
const variables = postcss.rule({ selector: scope });
parsed.walkDecls(/^--sidebar-/, declaration => { if (declaration.parent.type === 'rule' && declaration.parent.selector === ':root') variables.append(declaration.clone()); });
assert(variables.nodes?.length); output.append(variables);
parsed.walkRules(rule => {
  if (rule.source.start.offset < start || !families.test(rule.selector)) return;
  const selectors = postcss.list.comma(rule.selector), clone = rule.clone({ selector: selectors.map(scoped).join(',') });
  clone.walkDecls(/^(animation|animation-name)$/, declaration => {
    for (const name of animations.keys()) if (new RegExp('(^|[\\s,])' + name + '(?=$|[\\s,])').test(declaration.value)) {
      usedAnimations.add(name); declaration.value = declaration.value.replaceAll(name, 'sa-navigation-' + name);
    }
  });
  rows.push({ sourceSelector: rule.selector, scopedSelector: clone.selector, sourceOffset: rule.source.start.offset,
    declarations: rule.nodes.filter(node => node.type === 'decl').map(node => ({ property: node.prop, value: node.value, important: Boolean(node.important) })),
    sourceAtRules: (() => { const list = []; let p = rule.parent; while (p && p.type !== 'root') { list.unshift({ name: p.name, params: p.params }); p = p.parent; } return list; })() });
  append(rule, clone);
});
for (const name of usedAnimations) output.append(animations.get(name).clone({ params: 'sa-navigation-' + name }));
assert(rows.length > 40); assert(rows.every(row => postcss.list.comma(row.scopedSelector).every(selector => selector.startsWith(scope))));
const css = '/* Captured HyperKnow sidebar declarations, adapted by scripts/processing/scope-hyperknow-navigation.cjs. Source SHA256: ' + expectedSource + ' */\n' + output.toString() + '\n';
const audit = JSON.stringify({ source, sourceSha256: expectedSource, target, generatedSha256: hash(Buffer.from(css)),
  scope, sourceBoundaryOffset: start, ruleFamilies: families.source, ruleCount: rows.length, animationNames: [...usedAnimations],
  originalModified: false, scopeLimit: 'Captured CSS declarations only. React states and geometry adapters are separate; no full live-source, unknown mobile-state, original-icon or pixel-parity claim.', rules: rows }, null, 2) + '\n';
for (const [name, content] of [[target, css], [inventory, audit]]) {
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), content, name + ' is not the reproducible scoped artifact');
  else fs.writeFileSync(path.join(root, name), content);
}
assert.equal(hash(fs.readFileSync(path.join(root, source))), expectedSource);
console.log(JSON.stringify({ sourceSha256: expectedSource, ruleCount: rows.length, bytes: Buffer.byteLength(css), target, mode: process.argv.includes('--check') ? 'checked' : 'generated' }));
