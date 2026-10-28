import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';

// The owned browser API trusts loopback fixture clients. Keep independent test
// families out of one shared registration bucket without changing real limits.
export async function syntheticFamilyHeaders(page: Page) {
  const groups = randomBytes(12).toString('hex').match(/.{4}/g)!;
  const address = '2001:db8:' + groups.join(':');
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': address });
  return { 'content-type': 'application/json', 'x-forwarded-for': address };
}
