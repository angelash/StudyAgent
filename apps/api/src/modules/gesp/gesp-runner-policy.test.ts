import { describe, expect, it } from 'vitest';
import { gespCodeRunnerEnabled, gespRunnerEnvironment } from './gesp-runner-policy';

describe('GESP runner policy', () => {
  it('keeps student C++ execution off in production unless explicitly enabled', () => {
    expect(gespCodeRunnerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(gespCodeRunnerEnabled({ NODE_ENV: 'production', STUDY_GESP_CODE_RUNNER: 'enabled' })).toBe(true);
    expect(gespCodeRunnerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(gespCodeRunnerEnabled({ NODE_ENV: 'development', STUDY_GESP_CODE_RUNNER: 'disabled' })).toBe(false);
  });

  it('passes only process settings to the runner, never API secrets', () => {
    const env = gespRunnerEnvironment({ PATH: '/usr/bin', STUDY_GESP_WSL_DISTRO: 'Ubuntu', JWT_SECRET: 'x', OPENAI_API_KEY: 'y', DATABASE_URL: 'z' });
    expect(env).toEqual({ PATH: '/usr/bin', STUDY_GESP_WSL_DISTRO: 'Ubuntu' });
  });
});
