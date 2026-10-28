import { randomBytes } from 'node:crypto';

// The owned browser API trusts loopback fixture clients. Keep independent test
// families out of one shared registration bucket without changing real limits.
export function syntheticFamilyHeaders() {
  const groups = randomBytes(12).toString('hex').match(/.{4}/g)!;
  return { 'content-type': 'application/json', 'x-forwarded-for': '2001:db8:' + groups.join(':') };
}
