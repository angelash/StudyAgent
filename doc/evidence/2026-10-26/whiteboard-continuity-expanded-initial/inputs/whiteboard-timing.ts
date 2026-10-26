import type { Page, Request } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

export type NarrationTiming = {
  delayMs: number;
  requests: Array<{ unitId: string; voice: string; startedAt: number; status?: number; failure?: string }>;
  audio: Array<{ index: number; event: string; at: number; currentTime: number; duration: number | null }>;
};
/** Controlled network wait, real protected HTTP and real browser Audio events on one clock. */
export async function installNarrationTiming(page: Page, delayMs = 700) {
  const requests: NarrationTiming['requests'] = [];
  const observed = new Map<Request, NarrationTiming['requests'][number]>();
  page.on('response', response => { const entry = observed.get(response.request()); if (entry) entry.status = response.status(); });
  page.on('requestfailed', request => { const entry = observed.get(request); if (entry) entry.failure = request.failure()?.errorText ?? 'request_failed'; });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    let serial = 0; (window as any).__narrationTiming = [];
    (window as any).Audio = function (src?: string) {
      const audio = new NativeAudio(src), index = serial++;
      for (const event of ['loadedmetadata', 'playing', 'pause', 'ended', 'error']) audio.addEventListener(event, () => {
        (window as any).__narrationTiming.push({ index, event, at: performance.now(), currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : null });
      });
      return audio;
    };
  });
  await page.route('**/api/learning/studio/*whiteboards/*/narration/*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    const entry = { unitId: body.unitId, voice: body.voice ?? '', startedAt: await page.evaluate(() => performance.now()) };
    requests.push(entry); observed.set(route.request(), entry);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    if (page.isClosed() || route.request().failure()) return;
    await route.continue().catch(error => { if (!page.isClosed() && !route.request().failure()) throw error; });
  });
  return {
    async read(): Promise<NarrationTiming> { return { delayMs, requests: [...requests], audio: await page.evaluate(() => (window as any).__narrationTiming) }; },
    async save(name: string) {
      const result = await this.read(); writeFileSync(join(browserEvidence('whiteboard-continuity'), name + '.json'), JSON.stringify(result, null, 2) + '\n'); return result;
    },
  };
}
