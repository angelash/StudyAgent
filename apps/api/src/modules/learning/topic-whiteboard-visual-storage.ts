import { createTeachingVisualStorage } from './teaching-visual-storage';
export const topicVisualIdPattern = /^topic_whiteboard_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const storage = createTeachingVisualStorage({ namespace: 'topic-whiteboard-visuals', pattern: topicVisualIdPattern,
  prefix: 'topic_whiteboard_visual_', width: 1536, height: 1024 });
export const topicVisualRoot = storage.root, topicVisualDirectory = storage.directory, topicVisualStage = storage.stage,
  topicVisualFile = storage.file, publishTopicVisual = storage.publish, removeTopicVisualStage = storage.removeStage,
  purgeTopicVisual = storage.purge, pruneTopicVisualFiles = storage.pruneFiles, topicVisualDirectories = storage.directories,
  pruneTopicVisualStages = storage.pruneStages, newTopicVisualId = storage.newId;
export const topicVisualDescriptorFile = storage.descriptorFile, pruneRetainedTopicVisualFiles = storage.pruneRetainedFiles;
