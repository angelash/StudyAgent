import { completeTeachingEditorCopy, readTeachingEditorCopy, downloadTeachingEditorCopy } from '../p184/apps/web/lib/teaching-editor-copy';
import { loadTeachingEditorLocal, saveTeachingEditorLocal, clearTeachingEditorLocal } from '../p184/apps/web/lib/teaching-editor-local';
(window as any).teachingEditorQA = {
  complete: completeTeachingEditorCopy, read: readTeachingEditorCopy, download: downloadTeachingEditorCopy,
  load: loadTeachingEditorLocal, save: saveTeachingEditorLocal, clear: clearTeachingEditorLocal,
};
