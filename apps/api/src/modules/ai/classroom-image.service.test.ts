import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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
});
