import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ClassroomVisualCapabilities } from '@study-agent/contracts';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
@Injectable()
export class ClassroomImageService {
    private cached?: {
        until: number;
        value: Promise<ClassroomVisualCapabilities>;
    };
    private skill() { return process.env.STUDY_IMAGEGEN_SKILL_DIR || (process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME, 'skills/yw/aigw-imagegen') : null); }
    private python() { const local = resolve(workspaceRoot(), 'data/runtime/imagegen', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); return process.env.STUDY_IMAGE_PYTHON_COMMAND || (existsSync(local) ? local : process.env.STUDY_PDF_PYTHON_COMMAND || 'python'); }
    capabilities(): Promise<ClassroomVisualCapabilities> { if (!this.cached || this.cached.until < Date.now())
        this.cached = { until: Date.now() + 15000, value: this.probe() }; return this.cached.value; }
    private async probe(): Promise<ClassroomVisualCapabilities> {
        const base = { modelId: 'gpt-image-2' as const }, directory = this.skill();
        if (!directory || !existsSync(join(directory, 'scripts/image_gen.py')) || !existsSync(join(directory, 'scripts/get_current_env.py')))
            return { ...base, available: false, reason: 'skill_missing', message: '未找到小九集成生图技能，请配置技能目录；文字课堂可以继续。' };
        try {
            await this.run(['-c', "import openai, PIL, inspect; assert 'output_format' in inspect.signature(openai.resources.images.Images.generate).parameters"], undefined, 10000);
        }
        catch {
            return { ...base, available: false, reason: 'python_unavailable', message: '生图Python依赖或版本尚未就绪，请运行项目的 setup-imagegen.cjs 配置独立环境；文字课堂可以继续。' };
        }
        try {
            const probe = JSON.parse(await this.run([join(directory, 'scripts/get_current_env.py')], undefined, 10000));
            if (probe.next_action !== 'run_skill' || !probe.ready)
                throw new Error();
        }
        catch {
            return { ...base, available: false, reason: 'environment_unavailable', message: '小九图像代理当前未就绪，请确认小九已登录并重新启动服务；文字课堂可以继续。' };
        }
        return { ...base, available: true, reason: 'ready', message: '可生成讲解参考图，标注仍需核对。' };
    }
    async generate(prompt: string, directory: string, signal: AbortSignal) {
        const capability = await this.probe();
        if (!capability.available)
            throw new Error(capability.reason);
        if (signal.aborted)
            throw new Error('image_cancelled');
        const suffix = randomUUID().slice(0, 8), promptPath = join(directory, 'teaching-prompt-' + suffix + '.txt'), output = join(directory, 'teaching-image-' + suffix + '.png');
        writeFileSync(promptPath, prompt, { flag: 'wx', mode: 0o600 });
        // The installed skill is invoked as shipped. Never use a public endpoint or another model as fallback.
        const stdout = await this.run([join(this.skill()!, 'scripts/image_gen.py'), 'generate', '--model', 'gpt-image-2', '--size', '1024x1024', '--quality', 'medium', '--output-format', 'png', '--no-augment', '--prompt-file', promptPath, '--out', output, '--force'], signal, 240000);
        if (!stdout.includes('Wrote ') || !existsSync(output))
            throw new Error('image_output_missing');
        return { output, promptPath };
    }
    private run(args: string[], signal?: AbortSignal, timeoutMs = 240000): Promise<string> {
        return new Promise((resolvePromise, reject) => {
            if (signal?.aborted) {
                reject(new Error('image_cancelled'));
                return;
            }
            const child = spawn(this.python(), args, { env: process.env, windowsHide: true, shell: false });
            let output = '', errorOutput = '', finished = false;
            const finish = (error?: string) => { if (finished)
                return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) {
                try {
                    child.kill();
                }
                catch { }
                reject(new Error(error));
            }
            else
                resolvePromise(output); };
            const abort = () => finish('image_cancelled'), timer = setTimeout(() => finish('image_timeout'), timeoutMs);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted)
                abort();
            child.stdin.end();
            child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 32000)
                finish('image_output_invalid'); });
            child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk.toString()).slice(-16000); });
            child.on('error', () => finish('image_process_unavailable'));
            child.on('close', code => finish(code === 0 ? undefined : /\b(?:401|403)\b/.test(errorOutput) ? 'image_auth_unavailable' : 'image_provider_failed'));
        });
    }
}
