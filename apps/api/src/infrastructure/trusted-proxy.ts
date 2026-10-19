import { isIP } from 'node:net';

export function trustedProxies(value: string | undefined): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(',').map(entry => entry.trim());
  if (entries.length > 32 || entries.some(entry => {
    const [address, prefix, extra] = entry.split('/'), family = isIP(address);
    return !family || extra !== undefined || prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128));
  })) throw new Error('STUDY_TRUST_PROXY must contain explicit proxy IP addresses or CIDR ranges');
  return entries;
}
