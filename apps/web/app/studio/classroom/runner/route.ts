// The worker response has its own CSP: edited code can calculate and log, but cannot fetch,
// import code, access cookies or touch the page DOM. The caller terminates it after 2 seconds.
const runner = `self.onmessage = function(event) {
  const lines = []; let size = 0;
  const safeConsole = Object.freeze({ log: function(...values) {
    if (lines.length >= 100) return;
    const line = values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ').slice(0, 2000);
    size += line.length; if (size <= 20000) lines.push(line);
  }});
  try {
    if (typeof event.data?.code !== 'string' || event.data.code.length > 16000) throw new Error('代码过长或为空');
    const value = new Function('console', '"use strict";\\n' + event.data.code)(safeConsole);
    if (value !== undefined) safeConsole.log(value);
    if (!lines.length) lines.push('运行完成，没有输出。可以使用 console.log 查看结果。');
  } catch (error) { lines.push(String(error.name || 'Error') + ': ' + String(error.message).slice(0, 500)); }
  self.postMessage({lines});
};`;
export async function GET() {
  return new Response(runner, { headers: { 'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'" } });
}
