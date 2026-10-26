import { createServer, type Server, type RequestListener } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startTextTransport, textProviderConfiguration, verifyTextResponse } from './xiaojiu-text-transport';

const complete = (items: unknown[] = [{ type: 'message', content: [{ type: 'output_text', text: '{"reply":"匿名说明"}' }] }]) =>
  'event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response: { output: items } }) + '\n\n';
describe('text-only model transport boundary', () => {
  const servers: Server[] = [], transports: Awaited<ReturnType<typeof startTextTransport>>[] = [], directories: string[] = [];
  afterEach(async () => {
    for (const transport of transports.splice(0)) await transport.close();
    for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  async function fixture(handler: RequestListener) {
    const server = createServer(handler); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/v1/responses';
  }
  async function transport(upstream: string, signal?: AbortSignal, timeoutMs = 1000) {
    const value = await startTextTransport({ upstream, modelId: 'deepseek-v4-flash', timeoutMs, signal }); transports.push(value); return value;
  }
  const command = (value: Awaited<ReturnType<typeof startTextTransport>>, body: object = {}) => fetch(value.baseUrl + '/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer SYNTHETIC_ONLY' },
    body: JSON.stringify({ model: 'deepseek-v4-flash', stream: true, input: '匿名合成问题', ...body }),
  });
  it('sends no tools to the same upstream and preserves the chosen model, reasoning and synthetic auth', async () => {
    let received: any, authorization: string | undefined, cookie: string | undefined;
    const upstream = await fixture(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      received = JSON.parse(raw); authorization = req.headers.authorization; cookie = req.headers.cookie;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(complete());
    });
    const value = await transport(upstream), response = await command(value, { tools: [{ type: 'function', name: 'exec' }],
      tool_choice: 'auto', parallel_tool_calls: true, reasoning: { effort: 'high' } });
    expect(response.status).toBe(200); expect(await response.text()).toContain('response.completed');
    expect(received).toMatchObject({ model: 'deepseek-v4-flash', tools: [], tool_choice: 'none', parallel_tool_calls: false,
      reasoning: { effort: 'high' }, input: '匿名合成问题' });
    expect(authorization).toBe('Bearer SYNTHETIC_ONLY'); expect(cookie).toBeUndefined();
  });
  it.each(['function_call', 'custom_tool_call', 'computer_call', 'web_search_call', 'mcp_call'])('buffers and rejects %s before the caller sees any tool event', async type => {
    const upstream = await fixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n');
      res.end(complete([{ type, name: 'read_private_file', arguments: '{}' }]));
    });
    const response = await command(await transport(upstream)), body = await response.text();
    expect(response.status).toBe(502); expect(body).toContain('text_transport_rejected');
    expect(body).not.toContain('partial'); expect(body).not.toContain('read_private_file');
  });
  it('rejects tool argument events, missing completion, executable message parts and malformed streams', () => {
    for (const content of [
      'data: {"type":"response.function_call_arguments.delta","delta":"{}"}\n\n' + complete(),
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      complete([{ type: 'message', content: [{ type: 'function_call', name: 'read' }] }]),
      'data: incomplete-json\n\n',
    ]) expect(() => verifyTextResponse(Buffer.from(content))).toThrow();
  });
  it('never forwards requests with another model or route and refuses redirects', async () => {
    let calls = 0;
    const upstream = await fixture((_req, res) => { calls++; res.writeHead(307, { Location: 'http://127.0.0.1:1/secret' }).end(); });
    const value = await transport(upstream);
    expect((await command(value, { model: 'other-model' })).status).toBe(502);
    expect((await fetch(value.baseUrl + '/other', { method: 'POST' })).status).toBe(404); expect(calls).toBe(0);
    expect((await command(value)).status).toBe(502); expect(calls).toBe(1);
  });
  it('bounds upstream response size without publishing the partial reply', async () => {
    const upstream = await fixture((_req, res) => res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end('x'.repeat(4 * 1024 * 1024 + 1)));
    const response = await command(await transport(upstream)); expect(response.status).toBe(502); expect((await response.text()).length).toBeLessThan(500);
  });
  it('aborts a pending upstream on cancellation and timeout', async () => {
    const upstream = await fixture(() => {}), abort = new AbortController();
    const pending = command(await transport(upstream, abort.signal)); abort.abort();
    expect((await pending).status).toBe(502);
    const timed = await command(await transport(upstream, undefined, 30)); expect(timed.status).toBe(502);
  });
  it('takes only connection settings and explicitly required environment, excluding service secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'text-provider-')); directories.push(directory); const file = join(directory, 'config.toml');
    writeFileSync(file, 'developer_instructions = """\n[model_providers.fake]\nbase_url="https://fake.invalid"\n"""\nmodel_provider="fixture"\n[model_providers.fixture]\nname="Synthetic"\nbase_url="http://127.0.0.1:1234/v1"\nwire_api="responses"\nenv_key="STUDY_TEXT_TEST_KEY"\n[mcp_servers.synthetic]\ncommand="not-run"\n');
    const prior = { key: process.env.STUDY_TEXT_TEST_KEY, secret: process.env.STUDY_TEXT_UNRELATED_SECRET };
    process.env.STUDY_TEXT_TEST_KEY = 'SYNTHETIC_REQUIRED'; process.env.STUDY_TEXT_UNRELATED_SECRET = 'SYNTHETIC_NOT_FOR_MODEL';
    try {
      const value = textProviderConfiguration(file); expect(value.provider).toBe('fixture'); expect(value.upstream).toBe('http://127.0.0.1:1234/v1/responses');
      expect(value.environment.STUDY_TEXT_TEST_KEY).toBe('SYNTHETIC_REQUIRED'); expect(value.environment.STUDY_TEXT_UNRELATED_SECRET).toBeUndefined();
      expect(value.disabledMcp).toEqual(['mcp_servers.synthetic.enabled=false']);
    } finally {
      if (prior.key === undefined) delete process.env.STUDY_TEXT_TEST_KEY; else process.env.STUDY_TEXT_TEST_KEY = prior.key;
      if (prior.secret === undefined) delete process.env.STUDY_TEXT_UNRELATED_SECRET; else process.env.STUDY_TEXT_UNRELATED_SECRET = prior.secret;
    }
  });
});
