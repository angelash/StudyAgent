import { createTeachingVisualStorage } from './teaching-visual-storage';
export { visualSha, visualDigest, visualNoLinks } from './teaching-visual-storage';
export const visualIdPattern = /^classroom_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const storage = createTeachingVisualStorage({ namespace: 'classroom-visuals', pattern: visualIdPattern, prefix: 'classroom_visual_', width: 1024, height: 1024 });
export const visualRoot = storage.root, visualDirectory = storage.directory, visualStage = storage.stage, visualFile = storage.file,
  publishVisual = storage.publish, removeVisualStage = storage.removeStage, purgeVisual = storage.purge,
  pruneVisualFiles = storage.pruneFiles, visualDirectories = storage.directories, pruneVisualStages = storage.pruneStages, newVisualId = storage.newId;
