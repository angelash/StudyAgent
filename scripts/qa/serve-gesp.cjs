/* Isolated GESP browser fixture. Never imported by the product.
 * Uses an ephemeral synthetic identity, loopback only, and a separate business DB.
 */
require('reflect-metadata');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
process.env.STUDY_DATA_DIR = resolve('data/qa/gesp-browser');
process.env.STUDY_STORAGE = 'sqlite';
process.env.STUDY_WORKER_ENABLED = 'false';
process.env.NODE_ENV = 'development';
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:14008';
delete process.env.OPENAI_API_KEY;
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { AuthService } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const { requestToken } = require('../../apps/api/dist/apps/api/src/common/auth.guard.js');
async function main() {
  let token;
  const app = await NestFactory.create(AppModule, { logger: false, cors: { origin: 'http://127.0.0.1:13008', credentials: true } });
  app.use((req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).end();
    if (token && !requestToken(req)) req.headers.authorization = `Bearer ${token}`;
    next();
  });
  app.setGlobalPrefix('api'); await app.init();
  const store = app.get(InMemoryStoreService);
  await store.transaction(async () => {
    const actor = await app.get(AuthService).register({ principal: `gesp-browser-${randomBytes(6).toString('hex')}`, credential: randomBytes(24).toString('hex') });
    token = actor.token; store.users.find(u => u.id === actor.user.id).role = 'admin';
  });
  await app.listen(14008, '127.0.0.1');
  const web = require('next')({ dev: true, hostname: '127.0.0.1', port: 13008, dir: resolve('apps/web'),
    conf: { distDir: '.next/gesp-qa', transpilePackages: ['@study-agent/contracts', '@study-agent/config', '@study-agent/ui'] } });
  await web.prepare();
  const handler = web.getRequestHandler();
  http.createServer((req, res) => handler(req, res)).listen(13008, '127.0.0.1', () => {
    process.stdout.write('GESP synthetic browser fixture: http://127.0.0.1:13008/admin/gesp\n');
  });
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="zh-CN"><title>GESP responsive QA</title><style>body{margin:20px;background:#ddd}main{display:flex;gap:20px}iframe{height:1100px;border:1px solid #888;background:white}</style><h1>GESP 合成身份响应式检查</h1><main><section><h2>360px</h2><iframe title="360px" width="360" src="http://127.0.0.1:13008/admin/gesp"></iframe></section><section><h2>768px</h2><iframe title="768px" width="768" src="http://127.0.0.1:13008/admin/gesp"></iframe></section></main></html>');
  }).listen(13009, '127.0.0.1', () => process.stdout.write('GESP viewport fixture: http://127.0.0.1:13009\n'));
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
