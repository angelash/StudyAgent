/** Internal teaching suggestions are drafts, never a scoring or mastery result. */
export type TeachingToolPurpose = 'assessment_analysis' | 'hint_draft';
export type TeachingToolQuestion = { subject: string; stem: string; referenceAnswer: unknown; referenceAnalysis: string;
  originalDocument?: unknown; originalAnswerSchema?: unknown; mediaNotice?: string };
export type TeachingToolSource = { kind: 'temporary'; title: string } | { kind: 'question_bank'; questionId: string; fingerprint: string };
export type TeachingToolSnapshot = { source: TeachingToolSource; question: TeachingToolQuestion } &
  ({ purpose: 'assessment_analysis'; answer: unknown } | { purpose: 'hint_draft'; hintLevel: 1 | 2 | 3 });
export type TeachingToolDraft = { modelId?: string; source: { kind: 'temporary'; title: string; question: TeachingToolQuestion } | { kind: 'question_bank'; questionId: string } } &
  ({ purpose: 'assessment_analysis'; answer: unknown } | { purpose: 'hint_draft'; hintLevel: 1 | 2 | 3 });
export type TeachingAnalysisSuggestion = { summary: string; judgement: 'correct' | 'incorrect' | 'uncertain';
  observations: Array<{ source: 'question' | 'question_document' | 'reference_answer' | 'reference_analysis' | 'submitted_answer'; quote: string; observation: string }>;
  uncertainties: string[]; verificationSteps: string[]; confidenceLevel: 'low' | 'medium' | 'high'; reviewRequired: true; advisoryOnly: true };
export type TeachingHintSuggestion = { hint: string; focus: string; suggestedLevel: 1 | 2 | 3; reviewAdvice: string; reviewRequired: true; advisoryOnly: true };
export type TeachingToolResult = { purpose: 'assessment_analysis'; analysis: TeachingAnalysisSuggestion } |
  { purpose: 'hint_draft'; hint: TeachingHintSuggestion; warnings: Array<'possible_answer_disclosure'> };
export type TeachingToolPreflight = { fingerprint: string; requestedModelId: string; modelId: string; modelName: string;
  snapshot: TeachingToolSnapshot; contextCharacters: number; advisoryOnly: true; reviewRequired: true };
export type TeachingToolRunView = { id: string; requestKey: string; purpose: TeachingToolPurpose; requestedModelId: string;
  modelId: string; modelName: string; snapshot: TeachingToolSnapshot; revision: number;
  status: 'queued' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
  result: TeachingToolResult | null; createdAt: string; updatedAt: string; advisoryOnly: true; reviewRequired: true;
  task: { state: string; generation: number; version: number; errorCode: string | null } | null };
export type TeachingToolRunsPage = { runs: TeachingToolRunView[]; page: number; pageSize: number; hasMore: boolean };
