// Isolated loopback PostgreSQL cluster. Never registers a Windows service.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const root = path.resolve('data/qa/postgres'), configPath = path.join(root, 'credentials.json');
const binaries = path.resolve('data/tools/postgresql-17.11-5/pgsql/bin');
const cluster = path.join(root, 'cluster');
function run(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(binaries, name + '.exe'), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${name} failed: ${output.slice(-3000)}`)));
  });
}
function connection(config, admin = false) { return { host: '127.0.0.1', port: config.port, user: admin ? config.adminUser : config.appUser,
  password: admin ? config.adminPassword : config.appPassword, database: admin ? 'postgres' : config.database, connectionTimeoutMillis: 5000 }; }
async function checkPort(port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
async function main() {
  const command = process.argv[2] ?? 'init';
  if (!fs.existsSync(path.join(binaries, 'postgres.exe'))) throw new Error('Download and extract the pinned PostgreSQL binary distribution first');
  if (command === 'init') {
    if (fs.existsSync(root)) throw new Error('QA cluster directory already exists; inspect it and use start/status for this exact cluster');
    await checkPort(15439); fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const config = { purpose: 'StudyAgent isolated QA cluster', port: 15439, adminUser: 'study_qa_admin', adminPassword: randomBytes(32).toString('hex'),
      appUser: 'study_agent_app', appPassword: randomBytes(32).toString('hex'), database: 'study_agent_qa' };
    const passwordFile = path.join(root, 'initial-password.txt'); fs.writeFileSync(passwordFile, config.adminPassword, { flag: 'wx', mode: 0o600 });
    try { console.log(await run('initdb', ['-D', cluster, '-U', config.adminUser, '--pwfile=' + passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-instructions'])); }
    finally { fs.unlinkSync(passwordFile); }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.database !== 'study_agent_qa' ||
    config.appUser !== 'study_agent_app' || config.adminUser !== 'study_qa_admin' || !/^[a-f0-9]{64}$/.test(config.appPassword) ||
    !/^[a-f0-9]{64}$/.test(config.adminPassword) || !fs.existsSync(path.join(cluster, 'PG_VERSION'))) throw new Error('Cluster ownership metadata is invalid');
  if (command === 'stop') { console.log(await run('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '30'])); return; }
  if (command === 'status') { console.log(await run('pg_ctl', ['status', '-D', cluster])); return; }
  if (!['init', 'start'].includes(command)) throw new Error('Expected init/start/status/stop');
  await checkPort(config.port);
  console.log(await run('pg_ctl', ['start', '-D', cluster, '-l', path.join(root, 'server.log'), '-w', '-t', '30', '-o', `-p ${config.port} -h 127.0.0.1`]));
  const pool = new Pool(connection(config, true));
  try {
    const role = await pool.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [config.appUser]);
    if (!role.rowCount) await pool.query(`CREATE ROLE ${config.appUser} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${config.appPassword}'`);
    const database = await pool.query('SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [config.database]);
    if (database.rowCount && database.rows[0].owner !== config.appUser) throw new Error('Database owner differs from this QA application');
    if (!database.rowCount) await pool.query(`CREATE DATABASE ${config.database} OWNER ${config.appUser} ENCODING 'UTF8'`);
    const version = (await pool.query('SELECT version() AS version')).rows[0].version;
    const download = JSON.parse(fs.readFileSync('data/tools/postgresql-download.json', 'utf8'));
    const evidence = { at: new Date().toISOString(), version, port: config.port, host: '127.0.0.1', registeredSystemService: false,
      applicationRole: 'non-superuser, no createdb, no createrole; owns only isolated QA database', download,
      acceptance: 'environment prepared; production storage acceptance is a separate test' };
    fs.writeFileSync('doc/evidence/2026-10-19/postgres-environment.json', JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify(evidence));
  } finally { await pool.end(); }
}
module.exports = { connection };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
