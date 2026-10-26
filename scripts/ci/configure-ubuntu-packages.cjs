// Configure only the disposable Ubuntu runner's official package sources.
const fs = require('node:fs');
const path = require('node:path');

const archive = 'https://archive.ubuntu.com/ubuntu';
const security = 'https://security.ubuntu.com/ubuntu';
const known = new Map([
  ['http://azure.archive.ubuntu.com/ubuntu', archive],
  ['https://azure.archive.ubuntu.com/ubuntu', archive],
  ['mirror+file:/etc/apt/apt-mirrors.txt', archive],
  ['mirror+file:/etc/apt/apt-mirrors-security.txt', security],
  [archive, archive], [security, security],
]);

function regular(file, optional = false) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT' && optional) return false; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Expected regular APT file: ' + file);
  return true;
}

function rewrite(text, format) {
  let official = 0, changed = 0, uriField = false;
  const uri = value => {
    const token = value.replace(/\/$/, ''), replacement = known.get(token);
    if (replacement) { official++; if (replacement !== value) changed++; return replacement; }
    if (/^mirror\+file:/.test(token) || token.includes('azure.archive.ubuntu.com')) throw Error('Unknown active Ubuntu mirror: ' + token);
    return value;
  };
  const output = text.split(/(?<=\n)/).map(line => {
    if (format === 'list') return line.replace(/^(deb(?:-src)?\s+(?:\[[^\]]+\]\s+)?)(\S+)/, (_, prefix, value) => prefix + uri(value));
    if (/^[A-Za-z][A-Za-z-]*:/.test(line)) uriField = /^URIs:/.test(line);
    else if (!/^\s+\S/.test(line)) uriField = false;
    if (!uriField) return line;
    const prefix = /^URIs:/.test(line) ? 'URIs:' : '';
    return prefix + line.slice(prefix.length).replace(/\S+/g, uri);
  }).join('');
  return { output, official, changed };
}

function configureUbuntuPackages(aptRoot = '/etc/apt') {
  const root = path.resolve(aptRoot);
  for (const directory of [root, path.join(root, 'sources.list.d'), path.join(root, 'apt.conf.d')]) {
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw Error('Expected real APT directory: ' + directory);
  }
  const plans = [];
  for (const [name, format, optional] of [['sources.list.d/ubuntu.sources', 'sources', false], ['sources.list', 'list', true]]) {
    const file = path.join(root, name); if (!regular(file, optional)) continue;
    const before = fs.readFileSync(file, 'utf8'), result = rewrite(before, format);
    plans.push({ file, before, ...result });
  }
  if (!plans.reduce((sum, row) => sum + row.official, 0)) throw Error('No recognized official Ubuntu source; refusing ineffective configuration');
  const config = path.join(root, 'apt.conf.d/99study-agent-ci'); regular(config, true);
  const configBytes = fs.readFileSync(path.resolve(__dirname, '../../.github/apt-ci.conf'));
  // Validate every source and destination before the first write.
  for (const row of plans) if (row.output !== row.before) fs.writeFileSync(row.file, row.output);
  fs.writeFileSync(config, configBytes, { mode: 0o644 });
  return { sources: plans.map(row => ({ file: row.file, officialUris: row.official, changedUris: row.changed,
    effectiveSources: row.output })), config: '99study-agent-ci' };
}

module.exports = { configureUbuntuPackages };
if (require.main === module) {
  if (process.platform !== 'linux') throw Error('Default APT configuration is only for the disposable Linux CI runner');
  console.log(JSON.stringify(configureUbuntuPackages(), null, 2));
}
