import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { validate } from '../../common/validation';
import type { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

/**
 * 232 §4.3: a guardian sets whether a learner profile is a minor. Absent means minor; only an explicit false relaxes
 * the stricter AI output checks. Learners themselves cannot change it.
 */
const settingsSchema = z.object({ minor: z.boolean() }).strict();

export function updateLearnerSettings(store: InMemoryStoreService, user: InMemoryUserAccount, studentId: string, input: unknown,
  assertCanAccess: (user: InMemoryUserAccount, studentId: string) => void) {
  const command = validate(settingsSchema, input);
  if (!['parent', 'admin'].includes(user.role)) throw new ForbiddenException('只有监护人可以修改学习档案设置');
  assertCanAccess(user, studentId);
  return store.transaction(async () => {
    const profile = store.find('students', { id: studentId }) as { minor?: boolean } | undefined;
    if (!profile) throw new NotFoundException('学习档案不存在');
    profile.minor = command.minor;
    return { studentId, minor: command.minor };
  });
}

export function learnerSettings(profile: { minor?: boolean }) { return { minor: profile.minor !== false }; }
