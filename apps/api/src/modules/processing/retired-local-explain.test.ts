import { describe, expect, it } from 'vitest';
import { ProcessingController } from './processing.controller';

describe('retired offline import review', () => {
  it('rejects new review requests without creating a model task', async () => {
    const controller = new ProcessingController({} as any, {} as any, {} as any);
    await expect(controller.explain({ user: { id: 'admin', role: 'admin', status: 'active' } } as any)).rejects.toMatchObject({ status: 410 });
  });
  it('continues enforcing administrator access on the retired route', async () => {
    const controller = new ProcessingController({} as any, {} as any, {} as any);
    await expect(controller.explain({ user: { role: 'parent', status: 'active' } } as any)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects retries of historical offline review tasks', async () => {
    const controller = new ProcessingController({ tasks: { get: async () => ({ kind: 'question.local_explain' }) } } as any, {} as any, {} as any);
    await expect(controller.retry({ user: { id: 'admin', role: 'admin', status: 'active' } } as any, 'old-task', { expectedVersion: 1 })).rejects.toMatchObject({ status: 410 });
  });
});
