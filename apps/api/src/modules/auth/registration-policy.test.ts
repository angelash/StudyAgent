import { describe, expect, it } from 'vitest';
import { inviteCodes, registrationMode, registrationRefusal } from './registration-policy';

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe('registration policy', () => {
  it('is open in development and tests, invite-only in production by default', () => {
    expect(registrationMode(env({}))).toBe('open');
    expect(registrationMode(env({ NODE_ENV: 'development' }))).toBe('open');
    expect(registrationMode(env({ NODE_ENV: 'production' }))).toBe('invite');
    expect(registrationMode(env({ NODE_ENV: 'production', STUDY_REGISTRATION: 'OPEN' }))).toBe('open');
    expect(registrationMode(env({ STUDY_REGISTRATION: 'closed' }))).toBe('closed');
    expect(() => registrationMode(env({ STUDY_REGISTRATION: 'maybe' }))).toThrow('open, invite or closed');
  });
  it('accepts only a configured invite and refuses everyone when no invite is configured', () => {
    const invite = env({ NODE_ENV: 'production', STUDY_INVITE_CODES: ' family-2026 , short, tutor-2026-b ' });
    expect(inviteCodes(invite)).toEqual(['family-2026', 'tutor-2026-b']);
    expect(registrationRefusal('family-2026', invite)).toBeNull();
    expect(registrationRefusal(' tutor-2026-b ', invite)).toBeNull();
    for (const given of [undefined, '', 'short', 'family-2027', 'family-2026x']) expect(registrationRefusal(given, invite)).toBe('需要有效的邀请码才能创建账号。');
    expect(registrationRefusal('family-2026', env({ NODE_ENV: 'production' }))).toContain('不开放注册');
    expect(registrationRefusal('family-2026', env({ STUDY_REGISTRATION: 'closed', STUDY_INVITE_CODES: 'family-2026' }))).toContain('不开放注册');
    expect(registrationRefusal(undefined, env({}))).toBeNull();
  });
});
