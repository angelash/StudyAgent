import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClassroomImageService } from './classroom-image.service';
describe('installed classroom image skill adapter', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    it('diagnoses a missing integrated skill without exposing environment or falling back', async () => {
        vi.stubEnv('STUDY_IMAGEGEN_SKILL_DIR', join(tmpdir(), 'nonexistent-image-skill-' + Date.now()));
        const result = await new ClassroomImageService().capabilities();
        expect(result).toMatchObject({ available: false, reason: 'skill_missing', modelId: 'gpt-image-2' });
        expect(JSON.stringify(result)).not.toContain(tmpdir());
    });
    it('passes only a prompt file and bounded image arguments, retaining shell-sensitive text literally', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'image-adapter-')), skill = join(dir, 'skill');
        mkdirSync(join(skill, 'scripts'), { recursive: true });
        writeFileSync(join(skill, 'scripts/image_gen.py'), 'fixture');
        writeFileSync(join(skill, 'scripts/get_current_env.py'), 'fixture');
        vi.stubEnv('STUDY_IMAGEGEN_SKILL_DIR', skill);
        const service = new ClassroomImageService(), calls: string[][] = [], prompt = 'Literal data: `do not execute`; $(never); "quoted"\nSecond line.';
        vi.spyOn(service as any, 'run').mockImplementation(async (args: any) => { calls.push(args); if (args[0] === '-c')
            return ''; if (args[0].endsWith('get_current_env.py'))
            return JSON.stringify({ ready: true, next_action: 'run_skill' }); writeFileSync(args[args.indexOf('--out') + 1], 'fixture file; decoding is tested separately'); return 'Wrote ' + args[args.indexOf('--out') + 1]; });
        try {
            const result = await service.generate(prompt, dir, new AbortController().signal);
            expect(readFileSync(result.promptPath, 'utf8')).toBe(prompt);
            const call = calls.at(-1)!;
            expect(call).toContain('--force');
            expect(call[call.indexOf('--model') + 1]).toBe('gpt-image-2');
            expect(call[call.indexOf('--size') + 1]).toBe('1024x1024');
            expect(call.join(' ')).not.toContain('do not execute');
            expect(call[call.indexOf('--prompt-file') + 1]).toBe(result.promptPath);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
    it('edits only the supplied original with the same installed skill and retains literal changes in a separate prompt file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'image-edit-adapter-')), skill = join(dir, 'skill'), source = join(dir, 'original.png');
        mkdirSync(join(skill, 'scripts'), { recursive: true }); writeFileSync(join(skill, 'scripts/image_gen.py'), 'fixture');
        writeFileSync(join(skill, 'scripts/get_current_env.py'), 'fixture'); writeFileSync(source, 'Controlled original; real decoding is separate.');
        vi.stubEnv('STUDY_IMAGEGEN_SKILL_DIR', skill);
        const service = new ClassroomImageService(), calls: string[][] = [], prompt = 'Remove only the heading. Literal $(never) and `do not run`.\nKeep the Chinese labels.';
        vi.spyOn(service as any, 'run').mockImplementation(async (args: any) => {
            calls.push(args); if (args[0] === '-c') return '';
            if (args[0].endsWith('get_current_env.py')) return JSON.stringify({ ready: true, next_action: 'run_skill' });
            writeFileSync(args[args.indexOf('--out') + 1], 'Controlled output; not a provider result.'); return 'Wrote ' + args[args.indexOf('--out') + 1];
        });
        try {
            const result = await service.edit(prompt, dir, source, new AbortController().signal), args = calls.at(-1)!;
            expect(args[1]).toBe('edit'); expect(args[args.indexOf('--image') + 1]).toBe(source);
            expect(args[args.indexOf('--model') + 1]).toBe('gpt-image-2'); expect(args[args.indexOf('--size') + 1]).toBe('1536x1024');
            expect(args).not.toContain('--input-fidelity'); expect(args).toContain('--force'); expect(args.join(' ')).not.toContain('$(never)');
            expect(readFileSync(result.promptPath, 'utf8')).toBe(prompt); expect(readFileSync(source, 'utf8')).toContain('Controlled original');
            await expect(service.edit(prompt, dir, join(dir, 'missing.png'), new AbortController().signal)).rejects.toThrow('image_edit_source_unavailable');
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
    it('waits for an actual owned command and its child to stop before returning a cancellation', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'image-stop-tree-')), file = join(dir, 'owned-pids.json');
        vi.stubEnv('STUDY_IMAGE_PYTHON_COMMAND', process.execPath);
        const service = new ClassroomImageService(), controller = new AbortController();
        const code = "const fs=require('node:fs'),{spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true}); fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000);";
        const result = (service as any).run(['-e', code, file], controller.signal, 10000).then(() => 'unexpected-success', (error: Error) => error.message);
        try {
            const deadline = Date.now() + 5000;
            while (!existsSync(file) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
            expect(existsSync(file)).toBe(true); const pids: number[] = JSON.parse(readFileSync(file, 'utf8'));
            controller.abort(); expect(await result).toBe('image_cancelled');
            const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
            for (let count = 0; pids.some(alive) && count < 30; count++) await new Promise(resolve => setTimeout(resolve, 20));
            expect(pids.some(alive)).toBe(false);
        } finally { controller.abort(); await result; rmSync(dir, { recursive: true, force: true }); }
    });
});
