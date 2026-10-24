import { studioFileUuid } from './studio-file-paths';
import { publishAtomicMarker,releaseOwnAtomicMarker,type AtomicMarkerPhase,type AtomicMarkerPhaseHook } from './atomic-marker-publication';

export type StudioMarkerPurpose = 'lease' | 'purge' | 'revoked';
export type StudioMarkerPhase = AtomicMarkerPhase;
export type StudioMarkerPhaseHook = AtomicMarkerPhaseHook;

/** Shared with Python and the independent read-only audit; do not infer a PID from JSON fragments. */
export function parseStudioMarkerStagingName(name: string) {
  const match = /^(lease|purge|revoked)-([1-9]\d*)-([a-f0-9-]+)\.pending$/.exec(name);
  if (!match || !studioFileUuid.test(match[3])) return null;
  const pid = Number(match[2]);
  return Number.isSafeInteger(pid) ? { purpose: match[1] as StudioMarkerPurpose, pid, nonce: match[3] } : null;
}

export const releaseOwnStudioMarker = releaseOwnAtomicMarker;

/** The studio protocol keeps its original three purposes and recovery names. */
export async function publishStudioMarker(control: string, file: string, purpose: StudioMarkerPurpose,
  value: Record<string, unknown> & { nonce: string; pid: number }, afterPhase?: StudioMarkerPhaseHook) {
  return publishAtomicMarker({ directory: control, file, purpose, value, persistent: purpose === 'revoked', afterPhase });
}
