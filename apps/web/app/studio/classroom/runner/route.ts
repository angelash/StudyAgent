// Each experiment runs in its own CSP-restricted worker. No server execution, network or DOM.
const runner = `self.onmessage = async function(event) {
  const lines = []; let size = 0;
  const safeConsole = Object.freeze({ log: function(...values) {
    if (lines.length >= 100) return;
    const line = values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ').slice(0, 2000);
    size += line.length; if (size <= 20000) lines.push(line);
  }});
  const id = event.data?.id; let status = 'success';
  try {
    if (typeof event.data?.code !== 'string' || event.data.code.length > 16000) throw new Error('代码最多16000字符，不能截断运行');
    if (typeof event.data?.input !== 'string' || event.data.input.length > 8000) throw new Error('输入最多8000字符');
    const normalized = event.data.input.replace(/\\r\\n?/g, '\\n'), input = normalized ? normalized.split('\\n') : [];
    if (normalized.endsWith('\\n')) input.pop();
    let position = 0;
    const readLine = () => position < input.length ? input[position++] : null;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const value = await new AsyncFunction('console', 'readLine', 'input', '"use strict";\\n' + event.data.code)(safeConsole, readLine, Object.freeze([...input]));
    if (value !== undefined) safeConsole.log(value);
    if (!lines.length) lines.push('运行完成，没有输出。可以使用 console.log 查看结果。');
  } catch (error) { status = 'error'; safeConsole.log(String(error?.name || 'Error') + ': ' + String(error?.message || error).slice(0, 500)); }
  self.postMessage({id, status, lines});
};`;
export async function GET() {
  return new Response(runner, { headers: { 'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'" } });
}
