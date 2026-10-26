import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserEvidence } from './evidence';

export type NarrationTiming = {
  delayMs: number;
  requests: Array<{ unitId: string; startedAt: number }>;
  audio: Array<{ index: number; event: string; at: number; currentTime: number; duration: number }>;
};
/** Controlled network wait, real protected HTTP and real browser Audio events on one clock. */
export async function installNarrationTiming(page: Page, delayMs = 700) {
  const requests: NarrationTiming['requests'] = [];
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
    requests.push({ unitId: body.unitId, startedAt: await page.evaluate(() => performance.now()) });
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
