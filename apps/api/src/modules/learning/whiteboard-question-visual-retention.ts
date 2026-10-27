import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { pruneQuestionVisualFiles } from './whiteboard-question-visual-storage';

/** Read inside a fresh store context so adopting a version and collecting a candidate cannot race. */
export function retainedQuestionVisualFiles(store: InMemoryStoreService, id: string) {
  const keep = new Set<string>(), row = store.find('whiteboardQuestionVisuals', { id });
  if (row && row.status !== 'deleted' && row.files) for (const file of Object.values(row.files)) keep.add(file.name);
  for (const turn of store.inspect('whiteboardQuestionTurns')) for (const version of turn.teachingVersions ?? []) if (version.figure.visualId === id) {
    keep.add(version.figure.original.name); keep.add(version.figure.image.name);
  }
  return [...keep];
}
export function collectQuestionVisualFiles(store: InMemoryStoreService, id: string) { pruneQuestionVisualFiles(id, retainedQuestionVisualFiles(store, id)); }
