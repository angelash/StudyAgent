import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ClassroomVisualCapabilities, TopicVisualCapabilities } from '@study-agent/contracts';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { terminateChildProcess } from '../../common/terminate-child-process';
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
    async figureCapabilities(): Promise<TopicVisualCapabilities> {
        const base = await this.capabilities();
        if (!base.available) return { ...base, editAvailable: false };
        try {
            await this.run(['-c', "import openai, inspect; assert 'output_format' in inspect.signature(openai.resources.images.Images.edit).parameters"], undefined, 10000);
            return { ...base, editAvailable: true };
        } catch { return { ...base, editAvailable: false, message: '可生成参考图；当前修图依赖尚未就绪，原图和文字可以继续使用。' }; }
    }
    async generate(prompt: string, directory: string, signal: AbortSignal, options?: { size: '1024x1024' | '1536x1024' }) {
        return this.produce('generate', prompt, directory, signal, options?.size ?? '1024x1024');
    }
    async edit(prompt: string, directory: string, sourceImage: string, signal: AbortSignal, options?: { size: '1024x1024' | '1536x1024' }) {
        const source = resolve(sourceImage);
        const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
        if (!existsSync(source) || !lstatSync(source).isFile() || !source.toLowerCase().endsWith('.png') ||
            normalize(realpathSync(source)) !== normalize(source)) throw Error('image_edit_source_unavailable');
        return this.produce('edit', prompt, directory, signal, options?.size ?? '1536x1024', source);
    }
    private async produce(operation: 'generate' | 'edit', prompt: string, directory: string, signal: AbortSignal, size: string, sourceImage?: string) {
        if (!['1024x1024', '1536x1024'].includes(size)) throw Error('image_size_invalid');
        const capability = await this.probe();
        if (!capability.available)
            throw new Error(capability.reason);
        if (operation === 'edit') {
            try { await this.run(['-c', "import openai, inspect; assert 'output_format' in inspect.signature(openai.resources.images.Images.edit).parameters"], signal, 10000); }
            catch { throw Error(signal.aborted ? 'image_cancelled' : 'image_edit_unavailable'); }
        }
        if (signal.aborted)
            throw new Error('image_cancelled');
        const suffix = randomUUID().slice(0, 8), promptPath = join(directory, 'teaching-prompt-' + suffix + '.txt'), output = join(directory, 'teaching-image-' + suffix + '.png');
        writeFileSync(promptPath, prompt, { flag: 'wx', mode: 0o600 });
        // The installed skill is invoked as shipped. Never use a public endpoint or another model as fallback.
        const stdout = await this.run([join(this.skill()!, 'scripts/image_gen.py'), operation, '--model', 'gpt-image-2', '--size', size, '--quality', 'medium', '--output-format', 'png', '--no-augment',
            ...(sourceImage ? ['--image', sourceImage] : []), '--prompt-file', promptPath, '--out', output, '--force'], signal, 240000);
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
            const grouped = process.platform !== 'win32';
            const child = spawn(this.python(), args, { env: process.env, windowsHide: true, shell: false, detached: grouped });
            let output = '', errorOutput = '', finished = false;
            const finish = async (error?: string) => { if (finished)
                return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) {
                try { await terminateChildProcess(child, grouped); reject(new Error(error)); }
                catch { reject(new Error('image_process_stop_unconfirmed')); }
            }
            else
                resolvePromise(output); };
            const abort = () => finish('image_cancelled'), timer = setTimeout(() => finish('image_timeout'), timeoutMs);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted)
                abort();
            child.stdin.end();
            child.stdout.on('data', chunk => { if (finished) return; output += chunk.toString(); if (output.length > 32000)
                finish('image_output_invalid'); });
            child.stderr.on('data', chunk => { if (!finished) errorOutput = (errorOutput + chunk.toString()).slice(-16000); });
            child.on('error', () => finish('image_process_unavailable'));
            child.on('close', code => finish(code === 0 ? undefined : /\b(?:401|403)\b/.test(errorOutput) ? 'image_auth_unavailable' : 'image_provider_failed'));
        });
    }
}
