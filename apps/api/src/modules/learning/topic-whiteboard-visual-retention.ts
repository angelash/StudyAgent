import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { pruneRetainedTopicVisualFiles } from './topic-whiteboard-visual-storage';
/** Call inside a fresh store transaction/context so a newly confirmed shared snapshot cannot be missed. */
export function retainedTopicVisualFiles(store: InMemoryStoreService, id: string) {
  const keep = new Set<string>(), row = store.find('studioTopicWhiteboardVisuals', { id });
  if (row && row.status !== 'deleted' && row.files) for (const descriptor of Object.values(row.files)) keep.add(descriptor.name);
  for (const board of store.inspect('studioTopicWhiteboards')) for (const snapshot of board.figureSnapshots ?? []) {
    if (snapshot.visualId === id) { keep.add(snapshot.original.name); keep.add(snapshot.image.name); }
  }
  return [...keep];
}
export function collectTopicVisualFiles(store: InMemoryStoreService, id: string) {
  pruneRetainedTopicVisualFiles(id, retainedTopicVisualFiles(store, id));
}
