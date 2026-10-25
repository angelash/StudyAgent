import type { ProjectAttachmentRef, ProjectAttachmentSnapshot } from './project-assets';
export type ProjectStage = { id: string; title: string; objective: string;
  fields: Array<{ id: string; label: string; prompt: string }> };
export type ProjectCriterion = { id: string; title: string; levels: [string, string, string, string] };
export type CourseProjectDefinition = { id: string; courseId: string; unitId: string; title: string; brief: string;
  version: string; fingerprint: string; contentReview: 'pending'; provenance: string;
  stages: ProjectStage[]; rubric: ProjectCriterion[] };
export type ProjectEvidence = { id: string; label: string; content: string; source: string };
export type ProjectArtifact = { values: Record<string, string>; evidence: ProjectEvidence[]; attachments?: ProjectAttachmentRef[] };
export type ProjectRating = { criterionId: string; level: number; evidence: string; attachmentIds?:string[] };
export type ProjectSubmission = { id: string; stageId: string; number: number; artifact: ProjectArtifact;
  selfRatings: ProjectRating[]; attachmentManifest?: ProjectAttachmentSnapshot[]; revisionNote: string; previousSubmissionId: string | null; rubricVersion: string; at: string };
export type ProjectHumanReview = { id: string; submissionId: string; reviewerId: string;
  reviewerRole: 'parent' | 'teacher' | 'admin'; ratings: ProjectRating[]; comment: string;
  decision: 'needs_revision' | 'ready'; supersedesReviewId: string | null; at: string };
export type ProjectAdviceScope={fieldIds:string[];evidenceIds:string[];attachmentIds:string[]};
export type ProjectAdvice = { id: string; stageId: string; artifactFingerprint: string; scope?:ProjectAdviceScope; reply: string;
  modelName: string; at: string };
export type CourseProject = { id: string; ownerUserId: string; studentId: string | null; studioCourseId?: string;
  definition: CourseProjectDefinition; revision: number; currentStageId: string;
  drafts: Record<string, ProjectArtifact>; submissions: ProjectSubmission[]; reviews: ProjectHumanReview[];
  draftReflections: Record<string, { ratings: ProjectRating[]; revisionNote: string }>;
  advice: ProjectAdvice[]; legacyImports: Array<{ sessionId: string; text: string; at: string }>;
  createdAt: string; updatedAt: string };
export type CourseProjectView = CourseProject & { contentStatus: 'current' | 'archived' | 'unavailable';
  permissions: { edit: boolean; review: boolean } };
export type CourseProjectCatalog = { definitions: CourseProjectDefinition[]; projects: CourseProjectView[] };
export type ProjectCommandReceipt = { requestKey:string;kind:'save'|'submit'|'review'|'advice'|'import';appliedRevision:number;at:string;
  submissionId?:string;reviewId?:string;project:CourseProjectView };

/** Stable serialization also labels AI advice about an earlier draft. */
export function projectArtifactIdentity(artifact: ProjectArtifact): string {
  return JSON.stringify({ values: Object.fromEntries(Object.entries(artifact.values).sort(([a], [b]) => a.localeCompare(b))), evidence: artifact.evidence,
    ...(artifact.attachments===undefined?{}:{attachments:artifact.attachments.map(item=>({assetId:item.assetId,label:item.label,caption:item.caption,evidenceId:item.evidenceId??null}))}) });
}
