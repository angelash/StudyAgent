import { ConflictException } from '@nestjs/common';

/** Only optimistic store validation is retryable; source/version/business conflicts remain explicit. */
export class DomainWriteConflict extends ConflictException {
  constructor() { super('数据已更新，请重试本次操作'); }
}
