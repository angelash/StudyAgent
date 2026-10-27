import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { codexHomeDirectory } from './xiaojiu-models.service';

const maxRequestBytes = 1024 * 1024, maxResponseBytes = 4 * 1024 * 1024;
const systemEnvironment = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP',
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS'];

/** Read only simple connection settings; the installed CLI remains the configuration/authentication owner. */
export function textProviderConfiguration(configPath = resolve(codexHomeDirectory(), 'config.toml')) {
  const text = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const tables = new Map<string, Map<string, string>>(); let table = '', multiline: string | null = null;
  tables.set('', new Map());
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (multiline) { if (line.includes(multiline)) multiline = null; continue; }
    const assignment = line.match(/^([A-Za-z_][\w-]*)\s*=\s*(.*)$/);
    if (assignment && /^(?:"""|''')/.test(assignment[2])) {
      const quote = assignment[2].slice(0, 3);
      if (!assignment[2].slice(3).includes(quote)) multiline = quote;
      continue;
    }
    const heading = line.match(/^\[([^\[\]]+)\]\s*(?:#.*)?$/);
    if (heading) { table = heading[1].trim(); if (!tables.has(table)) tables.set(table, new Map()); continue; }
    if (assignment) tables.get(table)?.set(assignment[1], assignment[2]);
  }
  function string(value: string | undefined) {
    if (value === undefined) return undefined;
    const match = value.match(/^("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
    if (!match) throw new ServiceUnavailableException('小九文本连接配置格式不支持，请核对原provider设置');
    try { return match[1][0] === '"' ? JSON.parse(match[1]) as string : match[1].slice(1, -1); }
    catch { throw new ServiceUnavailableException('小九文本连接配置字符串无效'); }
  }
  const provider = string(tables.get('')?.get('model_provider')) ?? 'openai';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(provider)) throw new ServiceUnavailableException('小九文本provider名称不受支持');
  const settings = tables.get('model_providers.' + provider) ?? tables.get('model_providers."' + provider + '"') ?? tables.get("model_providers.'" + provider + "'");
  const base = string(settings?.get('base_url')) ?? (provider === 'openai' ? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1' : undefined);
  if (!base) throw new ServiceUnavailableException('未找到所选小九文本provider的原连接地址');
  let upstream: URL;
  try { upstream = new URL(base); } catch { throw new ServiceUnavailableException('小九文本provider地址无效'); }
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash)
    throw new ServiceUnavailableException('小九文本provider地址格式不支持');
  const wire = string(settings?.get('wire_api'));
  if (wire && wire !== 'responses') throw new ServiceUnavailableException('纯文本任务要求原provider支持Responses');
  const credentials = new Set<string>();
  const key = string(settings?.get('env_key')); if (key) credentials.add(key);
  if (provider === 'openai') { credentials.add('OPENAI_API_KEY'); credentials.add('CODEX_API_KEY'); }
  for (const [heading, values] of tables) if (heading === 'model_providers.' + provider + '.env_http_headers')
    for (const value of values.values()) { const name = string(value); if (name) credentials.add(name); }
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [...systemEnvironment, ...credentials]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ServiceUnavailableException('小九文本凭据环境名无效');
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  environment.CODEX_HOME = codexHomeDirectory();
  const disabledMcp = new Set<string>();
  if (tables.get('')?.has('mcp_servers')) throw new ServiceUnavailableException('纯文本任务暂不支持内联MCP配置');
  for (const [heading, values] of tables) {
    if (heading === 'mcp_servers') for (const name of values.keys()) disabledMcp.add(name);
    else if (heading.startsWith('mcp_servers.')) {
      const name = heading.slice('mcp_servers.'.length).match(/^([A-Za-z0-9_-]+)(?:\.|$)/)?.[1];
      if (!name) throw new ServiceUnavailableException('纯文本任务暂不支持此MCP名称格式');
      disabledMcp.add(name);
    }
  }
  return { provider, upstream: upstream.toString().replace(/\/$/, '') + '/responses', environment,
    disabledMcp: [...disabledMcp].map(name => 'mcp_servers.' + name + '.enabled=false') };
}

async function boundedBody(stream: AsyncIterable<Uint8Array>, maximum: number) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximum) throw Error('text_transport_size_limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function verifyEvent(value: unknown) {
  if (!value || typeof value !== 'object') throw Error('text_transport_invalid_event');
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string' || !/^(?:error|response\.(?:created|queued|in_progress|completed|failed|incomplete|error|output_item\.(?:added|done)|content_part\.(?:added|done)|output_text\.(?:delta|done)|refusal\.(?:delta|done)|reasoning(?:_summary)?(?:_text|_part)?\.(?:added|delta|done)))$/.test(event.type))
    throw Error('text_transport_unsupported_event');
  const inspect = (item: unknown) => {
    if (!item || typeof item !== 'object' || !['message', 'reasoning'].includes(String((item as Record<string, unknown>).type)))
      throw Error('text_transport_tool_output_rejected');
    const row = item as Record<string, unknown>;
    if (row.content !== undefined && (!Array.isArray(row.content) || row.content.some(part => !part ||
      typeof part !== 'object' || !['output_text', 'refusal'].includes(String(part.type)))))
      throw Error('text_transport_unsupported_content');
  };
  if (event.item) inspect(event.item);
  if (event.part && (!['output_text', 'refusal', 'summary_text', 'reasoning_text'].includes(String((event.part as Record<string, unknown>).type))))
    throw Error('text_transport_unsupported_content');
  if (event.response && typeof event.response === 'object') {
    const output = (event.response as Record<string, unknown>).output;
    if (output !== undefined) {
      if (!Array.isArray(output)) throw Error('text_transport_invalid_output');
      output.forEach(inspect);
    }
  }
}

export function verifyTextResponse(bytes: Buffer) {
  const text = bytes.toString('utf8'), parts = text.split(/(\r?\n\r?\n)/);
  let events = 0, completed = false, removedMetadata = false, filtered = '';
  for (let index = 0; index < parts.length; index += 2) {
    const block = parts[index], separator = parts[index + 1] ?? '';
    const lines = block.split(/\r?\n/), names = lines.filter(line => line.startsWith('event:')).map(line => line.slice(6).trim());
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') { filtered += block + separator; continue; }
    const value = JSON.parse(data);
    if (names.length > 1 || names.length === 1 && names[0] !== value.type) throw Error('text_transport_event_identity_mismatch');
    // Discard the entire non-semantic payload emitted by the current GPT route.
    // Metadata cannot supply text, tool calls or completion; other unknown events still fail.
    if (value && typeof value === 'object' && value.type === 'response.metadata') { removedMetadata = true; continue; }
    verifyEvent(value);
    events++;
    if (value.type === 'response.completed') completed = true;
    filtered += block + separator;
  }
  if (!events || !completed) throw Error('text_transport_incomplete_response');
  return removedMetadata ? Buffer.from(filtered, 'utf8') : bytes;
}

/** Only the original configured provider receives credentials. No tool event is released to the CLI. */
export async function startTextTransport(options: { upstream: string; modelId: string; timeoutMs: number; signal?: AbortSignal }) {
  const route = '/' + randomBytes(24).toString('hex') + '/responses', controllers = new Set<AbortController>();
  const server = createServer(async (request: IncomingMessage, response) => {
    if (request.method !== 'POST' || request.url !== route) { response.writeHead(404).end(); return; }
    const controller = new AbortController(); controllers.add(controller);
    const cancel = () => { controller.abort(); if (!request.complete) request.destroy(); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    request.once('aborted', cancel);
    const timeout = setTimeout(cancel, options.timeoutMs); timeout.unref();
    response.once('close', () => { if (!response.writableEnded) cancel(); });
    try {
      if (options.signal?.aborted) throw Error('text_transport_cancelled');
      const body = JSON.parse((await boundedBody(request, maxRequestBytes)).toString('utf8'));
      if (!body || typeof body !== 'object' || body.model !== options.modelId) throw Error('text_transport_model_changed');
      body.tools = []; body.tool_choice = 'none'; body.parallel_tool_calls = false;
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (!value || ['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding', 'cookie', 'proxy-authorization'].includes(key)) continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      headers.set('Content-Type', 'application/json'); headers.set('Accept', 'text/event-stream');
      const upstream = await fetch(options.upstream, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
      if (!upstream.body) throw Error('text_transport_empty_response');
      const bytes = await boundedBody(upstream.body as unknown as AsyncIterable<Uint8Array>, maxResponseBytes);
      let safeBytes: Buffer = bytes;
      if (upstream.ok) {
        if (!upstream.headers.get('content-type')?.includes('text/event-stream')) throw Error('text_transport_expected_events');
        safeBytes = verifyTextResponse(bytes);
      }
      response.writeHead(upstream.status, { 'Content-Type': upstream.ok ? 'text/event-stream' : 'application/json', 'Cache-Control': 'no-store' });
      response.end(safeBytes);
    } catch {
      // Error details and bodies may contain private prompts/auth; the caller receives a stable bounded error only.
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: { message: '小九纯文本响应被拒绝或连接中断', type: 'text_transport_rejected' } }));
    } finally { clearTimeout(timeout); controllers.delete(controller); options.signal?.removeEventListener('abort', cancel); }
  });
  server.requestTimeout = options.timeoutMs; server.headersTimeout = Math.min(options.timeoutMs, 10000);
  await new Promise<void>((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolvePromise(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw Error('text_transport_no_address'); }
  return { baseUrl: 'http://127.0.0.1:' + address.port + route.slice(0, -'/responses'.length),
    close: async () => { for (const controller of controllers) controller.abort(); server.closeAllConnections(); await new Promise<void>((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise())); } };
}
