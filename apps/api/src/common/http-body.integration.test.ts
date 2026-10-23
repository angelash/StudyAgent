import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
describe('bounded compressed JSON and parser process survival', () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-http-body-'));
    let child: ChildProcess, port: number, sequence = 0;
    beforeAll(async () => {
        const appModule = resolve(__dirname, '../../dist/apps/api/src/app.module.js'), bodyModule = resolve(__dirname, '../../dist/apps/api/src/common/http-body.js');
        const code = `require('reflect-metadata');
      (async()=>{const{NestFactory}=require('@nestjs/core'),{AppModule}=require(${JSON.stringify(appModule)});
      const app=await NestFactory.create(AppModule,{logger:false});require(${JSON.stringify(bodyModule)}).configureJsonBody(app);app.setGlobalPrefix('api');
      await app.listen(0,'127.0.0.1');process.send({port:app.getHttpServer().address().port});
      process.on('message',async message=>{if(message==='stop'){await app.close();process.exit(0);}});
      })().catch(()=>process.exit(1));`;
        child = spawn(process.execPath, ['-e', code], { cwd: resolve(__dirname, '../../../..'), windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' } });
        port = await new Promise<number>((resolvePort, reject) => { const timer = setTimeout(() => reject(new Error('Isolated parser process did not become ready')), 30000); child.once('error', () => { clearTimeout(timer); reject(new Error('Isolated parser process failed to start')); }); child.once('exit', () => { clearTimeout(timer); reject(new Error('Isolated parser process exited before readiness')); }); child.once('message', (message: any) => { clearTimeout(timer); if (Number.isInteger(message.port) && message.port > 0)
            resolvePort(message.port);
        else
            reject(new Error('Invalid parser process port')); }); });
    });
    afterAll(async () => { if (child && child.exitCode === null && child.connected)
        await new Promise<void>(resolveExit => { const timer = setTimeout(() => child.kill(), 5000); child.once('exit', () => { clearTimeout(timer); resolveExit(); }); child.send('stop'); }); rmSync(directory, { recursive: true, force: true }); });
    function body() { return Buffer.from(JSON.stringify({ principal: 'compressed-' + (++sequence) + '@local.test', credential: 'Anonymous-parser-fixture-only' })); }
    async function send(chunks: Buffer[], contentType = 'application/json') {
        return new Promise<{
            status: number;
            body: string;
        }>((resolveResponse, reject) => { const query = request({ hostname: '127.0.0.1', port, path: '/api/auth/register', method: 'POST', headers: { 'Content-Type': contentType, 'Content-Encoding': 'gzip', 'Content-Length': chunks.reduce((sum, chunk) => sum + chunk.length, 0) } }, response => { let content = ''; response.setEncoding('utf8'); response.on('data', chunk => { content += chunk; }); response.on('end', () => resolveResponse({ status: response.statusCode!, body: content })); }); query.setTimeout(10000, () => query.destroy(new Error('Compressed request timed out'))); query.on('error', reject); for (const chunk of chunks.slice(0, -1))
            query.write(chunk); if (chunks.length > 1)
            setTimeout(() => query.end(chunks.at(-1)), 25);
        else
            query.end(chunks[0]); });
    }
    async function healthy() { expect(child.exitCode).toBeNull(); expect((await fetch('http://127.0.0.1:' + port + '/api/health')).status).toBe(200); }
    it('accepts valid gzip JSON and rejects malformed compressed bytes without exposing input', async () => { expect((await send([gzipSync(body())])).status).toBe(201); const bad = await send([Buffer.from('anonymous-malformed-compression')]); expect(bad.status).toBe(400); expect(bad.body).not.toContain('anonymous-malformed-compression'); await healthy(); });
    it('survives late trailing compressed bytes and rejects an unsupported charset before decoding', async () => { const response = await send([gzipSync(body()), Buffer.from('late-non-gzip-bytes')]); expect([201, 400]).toContain(response.status); await healthy(); expect((await send([gzipSync(body())], 'application/json; charset=unknown-qa-charset')).status).toBe(415); await healthy(); });
    it('applies the 512KB limit to decoded content and keeps serving subsequent requests', async () => { const oversized = gzipSync(Buffer.from(JSON.stringify({ private: 'anonymous-size-limit-'.repeat(40000) }))), response = await send([oversized]); expect(response.status).toBe(413); expect(response.body).not.toContain('anonymous-size-limit-'); expect((await send([gzipSync(body())])).status).toBe(201); await healthy(); });
});
