export const classroomTurnIntents = [
  { id: 'question', label: '提问', prompt: '' },
  { id: 'example', label: '换个例子', prompt: '请围绕当前知识点换一个具体例子，说明条件和结论，再给我一个理解检查。' },
  { id: 'simplify', label: '说简单点', prompt: '请用更简单的语言解释当前知识点，保留必要的准确术语，最后检查我是否理解。' },
  { id: 'prerequisite', label: '补先修', prompt: '请帮我梳理理解当前内容需要的基础；没有依据的部分请标明是建议，再用一个小问题检查。' },
  { id: 'compare', label: '比较讲法', prompt: '请按相同维度对照当前概念的两种表达或情境，说明共同点、差别和适用条件。' },
] as const;
export type ClassroomTurnIntent = typeof classroomTurnIntents[number]['id'];
export type ClassroomTurnPosition = { contentFingerprint: string; stepId: string; sentenceCursor: number;
  presentationVersion: 'legacy-v1' | 'speech-v2'; unitId: string };
export type ClassroomTurnCommand = ClassroomTurnPosition & { requestKey: string; message: string; modelId: string;
  intent: ClassroomTurnIntent; questionId?: string };
export type ClassroomTurnView = { id: string; sessionId: string; requestKey: string; message: string;
  intent: ClassroomTurnIntent; modelId: string; modelName: string; questionId?: string;
  position: ClassroomTurnPosition & { cursor: number; stepTitle: string; sentenceText: string };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
  /** 232 §5.1: the worker's current step while running, so the learner sees progress instead of a blank wait. */
  stage?: ClassroomTurnStage;
  revision: number; createdAt: string; updatedAt: string; userMessageId?: string; assistantMessageId?: string;
  task: { state: string; generation: number; version: number; errorCode: string | null } | null };
export const classroomTurnStages = ['reading', 'explaining', 'checking'] as const;
export type ClassroomTurnStage = typeof classroomTurnStages[number];
export const classroomTurnStageLabels: Record<ClassroomTurnStage, string> = { reading: '读取当前讲解', explaining: '组织讲解', checking: '检查回答' };
