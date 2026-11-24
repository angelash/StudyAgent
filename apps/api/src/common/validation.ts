import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function validate<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException({ message: '输入格式有误',
    issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) });
  return parsed.data;
}

export const credentialsSchema = z.object({
  principal: z.string().trim().min(3).max(254).transform((value) => value.toLowerCase()),
  credential: z.string().min(10, '密码至少需要 10 个字符').max(128),
}).strict();
/** Registration also carries the optional invite; login keeps the strict two-field shape. */
export const registrationSchema = credentialsSchema.extend({ invite: z.string().trim().max(128).optional() }).strict();
