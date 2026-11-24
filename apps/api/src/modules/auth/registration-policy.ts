import { timingSafeEqual } from 'node:crypto';

/**
 * Who may create an account (232 §7). Production is invite-only by default; local development and tests stay open
 * because nearly every test registers over HTTP. STUDY_REGISTRATION overrides: 'open', 'invite' or 'closed'.
 * Invite codes come from STUDY_INVITE_CODES (comma separated, at least 8 characters each); none means nobody can register.
 */
export type RegistrationMode = 'open' | 'invite' | 'closed';

export function registrationMode(env: NodeJS.ProcessEnv = process.env): RegistrationMode {
  const configured = env.STUDY_REGISTRATION?.trim().toLowerCase();
  if (configured === 'open' || configured === 'invite' || configured === 'closed') return configured;
  if (configured) throw new Error('STUDY_REGISTRATION must be open, invite or closed');
  return env.NODE_ENV === 'production' ? 'invite' : 'open';
}

export function inviteCodes(env: NodeJS.ProcessEnv = process.env) {
  return (env.STUDY_INVITE_CODES ?? '').split(',').map(code => code.trim()).filter(code => code.length >= 8);
}

function same(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Null when this registration may proceed; otherwise the message to show. Never reveals whether a code exists. */
export function registrationRefusal(invite: string | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const mode = registrationMode(env);
  if (mode === 'open') return null;
  if (mode === 'closed') return '当前不开放注册，请联系管理员开通账号。';
  const codes = inviteCodes(env), given = invite?.trim() ?? '';
  if (!codes.length) return '当前不开放注册，请联系管理员开通账号。';
  return given && codes.some(code => same(code, given)) ? null : '需要有效的邀请码才能创建账号。';
}
