const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const webPort = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const apiPort = Number(process.env.API_PORT || 4000);
const logDirectory = path.join(root, 'output', 'daemon');
const common = {
  cwd: root,
  autorestart: true,
  exp_backoff_restart_delay: 250,
  kill_timeout: 15000,
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'study-agent-api',
      script: 'apps/api/dist/apps/api/src/main.js',
      interpreter: process.execPath,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 30,
      restart_delay: 2000,
      max_memory_restart: '1536M',
      out_file: path.join(logDirectory, 'api.out.log'),
      error_file: path.join(logDirectory, 'api.error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        API_HOST: process.env.API_HOST || '127.0.0.1',
        API_PORT: String(apiPort),
      },
    },
    {
      ...common,
      name: 'study-agent-web',
      script: 'scripts/run-web.cjs',
      args: 'start',
      interpreter: process.execPath,
      instances: 1,
      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 30,
      restart_delay: 2000,
      max_memory_restart: '1024M',
      out_file: path.join(logDirectory, 'web.out.log'),
      error_file: path.join(logDirectory, 'web.error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: String(webPort),
      },
    },
    {
      ...common,
      name: 'study-agent-health',
      script: 'scripts/operations/daemon-health.cjs',
      interpreter: process.execPath,
      instances: 1,
      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '128M',
      out_file: path.join(logDirectory, 'health.out.log'),
      error_file: path.join(logDirectory, 'health.error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        STUDYAGENT_WEB_URL: `http://127.0.0.1:${webPort}/`,
        STUDYAGENT_API_URL: `http://127.0.0.1:${apiPort}/api/ready`,
        STUDYAGENT_HEALTH_INTERVAL_MS: '30000',
        STUDYAGENT_HEALTH_FAILURE_LIMIT: '3',
      },
    },
  ],
};
