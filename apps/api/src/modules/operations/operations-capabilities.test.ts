import 'reflect-metadata';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capabilityCommand, OperationsCapabilitiesController, OperationsCapabilitiesService } from './operations-capabilities.service';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function missingEnvironment() {
  vi.stubEnv('XIAOJIU_CHAT_ENABLED', 'false');
  vi.stubEnv('CODEX_COMMAND', resolve('no-private-fixture-cli.exe'));
  vi.stubEnv('STUDY_PYTHON', resolve('no-private-fixture-python.exe'));
  vi.stubEnv('STUDY_FFMPEG', resolve('no-private-fixture-ffmpeg.exe'));
  vi.stubEnv('STUDY_FFPROBE', resolve('no-private-fixture-ffprobe.exe'));
  vi.stubEnv('STUDY_GESP_WSL_DISTRO', 'QA-Dependency-Missing');
  vi.stubEnv('STUDY_ASSET_ROOT', resolve('no-private-fixture-assets'));
}
function service() {
  const models = { catalog: vi.fn(() => ({ models: [], defaultModel: 'synthetic' })) };
  const images = { capabilities: vi.fn(async () => { throw Error('private-provider-address private-token'); }) };
  const paper = { installation: vi.fn(async () => { throw Error('private-installation-path'); }) };
  const value = new OperationsCapabilitiesService({ persistence: { durable: true } } as any, models as any,
    { capabilities: () => ({ provider: null }) } as any, images as any, paper as any);
  return { value, models, images, paper };
}
describe('independent, bounded operational capability checks', () => {
  it('keeps core learning available with every optional tool missing, without leaking raw paths or errors', async () => {
    missingEnvironment(); const { value } = service(), report = await value.check();
    expect(report.checks).toHaveLength(11);
    expect(new Set(report.checks.map(row => row.id)).size).toBe(11);
    expect(report.checks.find(row => row.id === 'storage')).toMatchObject({ state: 'ready', optional: false });
    expect(report.checks.find(row => row.id === 'text_models')?.state).toBe('disabled');
    for (const row of report.checks.filter(row => !['storage', 'text_models'].includes(row.id))) {
      expect(row.state).toBe('unavailable'); expect(row.repair).toBeTruthy(); expect(row.optional).toBe(true);
    }
    const text = JSON.stringify(report);
    for (const privateValue of ['private-provider-address', 'private-token', 'private-installation-path', process.cwd(), 'no-private-fixture']) expect(text).not.toContain(privateValue);
  });
  it('coalesces concurrent refreshes and rechecks after the advertised cache lifetime', async () => {
    missingEnvironment(); const { value, images } = service();
    const [first, concurrent] = await Promise.all([value.check(), value.check()]);
    expect(first).toEqual(concurrent); expect(images.capabilities).toHaveBeenCalledTimes(1);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 31000);
    await value.check(); expect(images.capabilities).toHaveBeenCalledTimes(2);
  });
  it('rejects every non-administrator before any probe starts', async () => {
    const check = vi.fn(), controller = new OperationsCapabilitiesController({ check } as any);
    for (const role of ['parent', 'student', 'teacher']) expect(() => controller.check({ user: { role } } as any)).toThrow('管理员权限');
    expect(check).not.toHaveBeenCalled();
    controller.check({ user: { role: 'admin' } } as any); expect(check).toHaveBeenCalledOnce();
  });
  it('bounds native stdout, errors, missing binaries and stalled processes', async () => {
    expect(await capabilityCommand(process.execPath, ['-e', 'process.stdout.write("known-version")'])).toBe('known-version');
    expect(await capabilityCommand(process.execPath, ['-e', 'process.stderr.write("private-error");process.exit(1)'])).toBeNull();
    expect(await capabilityCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(70000))'])).toBeNull();
    expect(await capabilityCommand(resolve('missing-capability-tool.exe'), [])).toBeNull();
    const started = performance.now();
    expect(await capabilityCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 250)).toBeNull();
    expect(performance.now() - started).toBeLessThan(15000);
  });
});
