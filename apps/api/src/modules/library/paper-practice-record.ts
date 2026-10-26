import type { PaperPracticeDisposition, PaperPracticeSelfReview, PaperReviewOrganization, PaperPracticeOrigin } from '@study-agent/contracts';

export type PaperPracticeSource = {
  paperId: string; title: string; state: string; detailSha256: string; publicationVersion: number | null;
  publicationStatus: string; research: boolean;
};
export type PaperPracticeItemRecord = {
  id: string; paperId: string; position: number; sourceQuestionId: string; kind: 'question' | 'document' | 'missing';
  html: string; options: string[]; answerHtml: string; analysisHtml: string; hasAnswer: boolean; pdfUrl: string | null;
  promptMedia: string[]; referenceMedia: string[]; draft: string;
  firstAnswer: { disposition: PaperPracticeDisposition; text: string; submittedAt: string } | null;
  revealed: boolean; selfReview: PaperPracticeSelfReview | null; corrections: Array<{ id: string; text: string; at: string }>;
  organization?: PaperReviewOrganization;
};
export type PaperPracticeSessionRecord = {
  id: string; ownerUserId: string; studentId: string | null; requestKey: string; inputHash: string; sourceHash: string;
  status: 'in_progress' | 'paused' | 'completed'; version: number; currentItemId: string;
  createdAt: string; updatedAt: string; completedAt: string | null;
  sources: PaperPracticeSource[]; items: PaperPracticeItemRecord[];
  origin?: PaperPracticeOrigin;
};
export type PaperPracticeCommandRecord = {
  id: string; ownerUserId: string; studentId: string | null; sessionId: string; requestKey: string; inputHash: string;
  kind: string; appliedVersion: number; at: string;
};
