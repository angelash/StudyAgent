import { createTeachingVisualStorage } from './teaching-visual-storage';

export const questionVisualIdPattern = /^whiteboard_question_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const storage = createTeachingVisualStorage({ namespace: 'whiteboard-question-visuals', pattern: questionVisualIdPattern,
  prefix: 'whiteboard_question_visual_', width: 1536, height: 1024 });
export const questionVisualRoot = storage.root, questionVisualDirectory = storage.directory, questionVisualStage = storage.stage,
  questionVisualFile = storage.file, publishQuestionVisual = storage.publish, removeQuestionVisualStage = storage.removeStage,
  pruneQuestionVisualFiles = storage.pruneRetainedFiles, questionVisualDirectories = storage.directories,
  pruneQuestionVisualStages = storage.pruneStages, questionVisualDescriptorFile = storage.descriptorFile, newQuestionVisualId = storage.newId;
