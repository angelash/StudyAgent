const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), own = path.join(__dirname, 'postgres'), data = path.join(own, 'cluster'), bin = path.join(root, 'data/tools/postgresql-17.11-5/pgsql/bin');
if (fs.existsSync(own)) throw Error('New exclusive PostgreSQL directory required'); fs.mkdirSync(own);
const password = crypto.randomBytes(24).toString('base64url'), pwfile = path.join(own, 'password.private'); fs.writeFileSync(pwfile, password + '\n', { flag: 'wx' });
function run(name, args) { const log = fs.openSync(path.join(own, name + '-first.log'), 'wx'); const result = spawnSync(path.join(bin, name + '.exe'), args,
  { windowsHide: true, stdio: ['ignore', log, log], timeout: 60000 }); fs.closeSync(log); if (result.status !== 0) throw Error(name + ' failed; original private log retained'); }
run('initdb', ['-D', data, '--username=study_paper_business_qa', '--pwfile=' + pwfile, '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8', '--locale=C']);
run('pg_ctl', ['-D', data, '-l', path.join(own, 'server.private.log'), '-o', '-p 15444 -h 127.0.0.1 -c max_connections=40 -c shared_buffers=32MB', '-w', '-t', '45', 'start']);
const { Pool } = require('node:module').createRequire(path.join(root, 'data/qa/p172/package.json'))('pg');
const url = new URL('postgresql://study_paper_business_qa@127.0.0.1:15444/postgres'); url.password = password;
(async () => {
  const pool = new Pool({ connectionString: url.toString(), max: 1 }); try { await pool.query('CREATE DATABASE study_paper_business'); } finally { await pool.end(); }
  url.pathname = '/study_paper_business'; fs.writeFileSync(path.join(__dirname, 'postgres-runtime.private.json'), JSON.stringify({ connectionString: url.toString(), bin, data, port: 15444 }), { flag: 'wx' });
  const result = { port: 15444, bind: '127.0.0.1', exclusiveGeneratedCluster: true, formalDatabaseContacted: false, ready: true };
  fs.writeFileSync(path.join(__dirname, 'postgres-start-first.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result));
})().catch(() => { console.error('Owned PostgreSQL setup failed; private configuration and original logs retained.'); process.exitCode = 1; });
