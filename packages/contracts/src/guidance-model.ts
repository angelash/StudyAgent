import type { GuidanceAction } from './diagnostics';

export type GuidanceModelSuggestionStatus = 'queued' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
export type GuidanceModelText = { summary: string; activities: Array<{ actionId: string; activity: string; evidenceIds: string[] }> };
export type GuidanceModelOriginal = { summary: string; minutesPerDay: number; actions: Array<Pick<GuidanceAction,
  'id' | 'atomId' | 'hypothesisId' | 'title' | 'activity' | 'minutes' | 'successCriterion' | 'retestAt' | 'evidenceIds'>> };
export type GuidanceModelSuggestionView = {
  id: string; planId: string; studentId: string; requestKey: string; requestedModelId: string; modelId: string; modelName: string;
  planRevision: number; baselineReportVersion: number; status: GuidanceModelSuggestionStatus; revision: number;
  original: GuidanceModelOriginal; result: GuidanceModelText | null; createdAt: string; updatedAt: string;
  eligibility: { canAdopt: boolean; reason: string }; adoptedRevision: number | null;
  task: { state: string; generation: number; version: number; errorCode: string | null } | null;
};
export type GuidanceModelSuggestionList = { suggestions: GuidanceModelSuggestionView[]; hasMore: boolean; page: number; pageSize: number };
export type GuidanceModelSuggestionCommand = { requestKey: string; modelId: string; expectedRevision: number };
export type GuidanceModelAdoptionCommand = { requestKey: string; expectedRevision: number; suggestionRevision: number };
