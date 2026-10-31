const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'), 'utf8'));
const { Pool } = require('node:module').createRequire(path.join(candidate, 'package.json'))('pg');
(async () => {
  if (path.resolve(config.data) !== path.join(__dirname, 'postgres/cluster')) throw Error('Expected exclusive generated cluster');
  const target = new URL(config.connectionString);
  if (target.hostname !== '127.0.0.1' || target.port !== '15443' || target.pathname !== '/study_paper_persistence') throw Error('Wrong generated cluster');
  const pool = new Pool({ connectionString: target.toString(), max: 1 });
  try {
    const identity = (await pool.query('SELECT current_user name,inet_server_port() port')).rows[0];
    if (identity.name !== 'study_paper_qa' || identity.port !== 15443) throw Error('Wrong cluster identity');
    if (!(await pool.query("SELECT datname FROM pg_database WHERE datname='study_agent_qa'")).rowCount) await pool.query('CREATE DATABASE study_agent_qa');
  } finally { await pool.end(); }
  target.pathname = '/study_agent_qa';
  const env = { ...process.env, STUDY_TEST_PAPER_LIBRARY_POSTGRES_URL: config.connectionString, STUDY_TEST_PAPER_LIBRARY_PG_BIN: config.bin };
  for (const name of ['STUDY_TEST_TOPIC_WHITEBOARD_POSTGRES_URL', 'STUDY_TEST_TOPIC_VISUAL_POSTGRES_URL',
    'STUDY_TEST_WHITEBOARD_QUESTION_POSTGRES_URL', 'STUDY_TEST_TEACHING_TOOL_POSTGRES_URL', 'STUDY_TEST_QUESTION_VISUAL_POSTGRES_URL']) env[name] = target.toString();
  const suites = ['topic-whiteboard-postgres.integration.test.ts', 'topic-whiteboard-visual-postgres.integration.test.ts',
    'whiteboard-question-postgres.integration.test.ts', 'teaching-tool-storage.integration.test.ts', 'whiteboard-question-visual-storage.integration.test.ts']
    .map(name => 'src/infrastructure/' + name);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), 'legacy-postgres-first', 'test', ...suites],
    { cwd: root, windowsHide: true, env, stdio: 'inherit', timeout: 420000 });
  process.exitCode = result.status ?? 1;
})().catch(() => { console.error('Owned legacy PostgreSQL regression failed; private configuration retained.'); process.exitCode = 1; });
