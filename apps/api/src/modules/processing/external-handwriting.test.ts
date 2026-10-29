import { afterEach, describe, expect, it } from 'vitest';
import { ProcessingController } from './processing.controller';

const prior = process.env.STUDY_HANDWRITING_PROCESSOR;
afterEach(() => {
  if (prior === undefined) delete process.env.STUDY_HANDWRITING_PROCESSOR;
  else process.env.STUDY_HANDWRITING_PROCESSOR = prior;
});
const request = { user: { id: 'admin', role: 'admin', status: 'active' } } as any;

describe('optional external handwriting processor', () => {
  it('does not enqueue a preview when no external processor is configured', async () => {
    delete process.env.STUDY_HANDWRITING_PROCESSOR;
    const controller = new ProcessingController({} as any, {} as any, {} as any);
    await expect(controller.handwriting(request, { fileId: 'file', requestKey: 'request-1' })).rejects.toMatchObject({ status: 503 });
  });
  it('rejects relative executable paths', async () => {
    process.env.STUDY_HANDWRITING_PROCESSOR = 'tools/processor.py';
    const controller = new ProcessingController({} as any, {} as any, {} as any);
    await expect(controller.handwriting(request, { fileId: 'file', requestKey: 'request-1' })).rejects.toMatchObject({ status: 503 });
  });
  it('continues to enqueue an ordinary preview task through a configured adapter', async () => {
    process.env.STUDY_HANDWRITING_PROCESSOR = process.platform === 'win32' ? 'F:/external/processor.py' : '/opt/external/processor.py';
    const intents: any[] = [];
    const store = { tasks: { find: async () => undefined }, nextId: () => 'task-1', enqueueTask: async (intent: any) => { intents.push(intent); } };
    const files = { get: () => ({ id: 'file', status: 'ready', mediaType: 'image/png', sha256: 'source-hash' }) };
    const controller = new ProcessingController(store as any, files as any, { publish() {} } as any);
    await expect(controller.handwriting(request, { fileId: 'file', requestKey: 'request-1' })).resolves.toMatchObject({ kind: 'image.handwriting.preview', state: 'queued' });
    expect(intents[0].payload).toEqual({ fileId: 'file', sha256: 'source-hash' });
  });
  it('rejects historical preview retries when the external tool is absent', async () => {
    delete process.env.STUDY_HANDWRITING_PROCESSOR;
    const controller = new ProcessingController({ tasks: { get: async () => ({ kind: 'image.handwriting.preview' }) } } as any, {} as any, {} as any);
    await expect(controller.retry(request, 'task-1', { expectedVersion: 1 })).rejects.toMatchObject({ status: 503 });
  });
});
