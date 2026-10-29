import type { StudioSubject } from './studio';

/** Read-only navigation metadata, resolved after the original activity authorization. */
export type ActivityNavigationContext =
  | { audience: 'independent' }
  | { audience: 'student'; studentId: string; subject: StudioSubject }
  | { audience: 'unavailable' };
