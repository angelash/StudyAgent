// Responsive QA host: real pages render inside fixed-width browser frames.
const http = require('node:http');
const allowed = ['/student/assessment', '/library', '/parent/dashboard', '/student/today'];
http.createServer((req, res) => {
  if (!['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)) { res.writeHead(403).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:13001');
  const path = url.searchParams.get('path') || '/student/assessment';
  if (!allowed.includes(path.split('?')[0])) { res.writeHead(400).end(); return; }
  const src = `http://127.0.0.1:13000${path}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="zh-CN"><title>StudyAgent 360px / 768px 真实响应式验收</title><style>body{margin:20px;background:#deded5;font:14px sans-serif}main{display:flex;gap:24px;align-items:flex-start}iframe{border:1px solid #aab4a5;height:820px;background:#fff}h1{font-size:18px}h2{font-size:14px}</style><h1>本地合成账号 · 真实页面响应式验收</h1><main><section><h2>360 px 手机</h2><iframe title="360像素手机视口" src="${src}" width="360"></iframe></section><section><h2>768 px 平板</h2><iframe title="768像素平板视口" src="${src}" width="768"></iframe></section></main></html>`);
}).listen(13001, '127.0.0.1', () => process.stdout.write('Responsive QA ready: http://127.0.0.1:13001\n'));
