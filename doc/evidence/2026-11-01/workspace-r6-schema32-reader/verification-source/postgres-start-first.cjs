const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), own = path.join(__dirname, 'postgres'), data = path.join(own, 'cluster'), bin = path.join(root, 'data/tools/postgresql-17.11-5/pgsql/bin');
function run(name, args) { const log = fs.openSync(path.join(own, name + '-first.log'), 'wx'); const result = spawnSync(path.join(bin, name + '.exe'), args, { windowsHide: true, stdio: ['ignore', log, log], timeout: 60000 }); fs.closeSync(log); if (result.status !== 0) throw Error(name + ' failed; private log retained'); }
(async () => {
  if (fs.existsSync(own)) throw Error('Unused owned PostgreSQL directory required');
  await new Promise((yes, no) => { const server = net.createServer(); server.once('error', no); server.listen(15454, '127.0.0.1', () => server.close(yes)); });
  fs.mkdirSync(own); const password = crypto.randomBytes(24).toString('base64url'), pwfile = path.join(own, 'password.private'); fs.writeFileSync(pwfile, password + '\n', { flag: 'wx', mode: 0o600 });
  run('initdb', ['-D', data, '--username=study_teaching_packages_qa', '--pwfile=' + pwfile, '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8', '--locale=C']);
  run('pg_ctl', ['-D', data, '-l', path.join(own, 'server.private.log'), '-o', '-p 15454 -h 127.0.0.1 -c max_connections=40 -c shared_buffers=32MB', '-w', '-t', '45', 'start']);
  const { Pool } = require('pg'), url = new URL('postgresql://study_teaching_packages_qa@127.0.0.1:15454/postgres'); url.password = password;
  const pool = new Pool({ connectionString: url.toString(), max: 1 }); try { await pool.query('CREATE DATABASE study_teaching_packages'); } finally { await pool.end(); }
  url.pathname = '/study_teaching_packages'; fs.writeFileSync(path.join(__dirname, 'postgres-runtime.private.json'), JSON.stringify({ connectionString: url.toString(), bin, data, port: 15454 }), { flag: 'wx', mode: 0o600 });
  const result = { port: 15454, bind: '127.0.0.1', exclusiveGeneratedCluster: true, formalDatabaseContacted: false, ready: true };
  fs.writeFileSync(path.join(__dirname, 'postgres-start-first.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result));
})().catch(() => { console.error('Owned PostgreSQL setup failed; private configuration and original logs retained.'); process.exitCode = 1; });
