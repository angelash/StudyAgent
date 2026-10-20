import { z } from 'zod';
import { knowledgeAtomSchema } from './diagnostics';

const key = z.string().min(1).max(180);
export type CurriculumTocPart = { name: string; printedPage: number; tocPage?: number };
export type CurriculumLesson = {
  id: string; name: string; printedPage?: number; tocPage?: number;
  kind?: 'lesson' | 'activity' | 'reference'; number?: number; skim?: boolean;
  /** Combined texts share one progress entry; parts are not independent evidence. */
  parts?: CurriculumTocPart[];
};
export type CurriculumChapter = {
  id: string; name: string; lessons: CurriculumLesson[]; printedPage?: number; tocPage?: number;
  kind?: 'unit' | 'orientation' | 'appendix' | 'anthology';
  pageBasis?: 'printed_heading' | 'first_entry'; syntheticHeading?: boolean;
};
export type CurriculumBook = {
  id: string; subject: 'math' | 'chinese' | 'english'; grade: number; term: 'upper' | 'lower';
  edition: string; title: string; version: string; source: 'archive' | 'public_catalog' | 'original';
  sourceRef: string; sourceSha256: string; chapterState: 'available' | 'missing';
  chapters: CurriculumChapter[];
  catalogVersion?: string;
  chapterEvidence?: {
    reviewId: string; method: 'agent_visual_review'; reviewedAt: string; idScheme: 'local_toc_ids';
    sourceManifestSha256: string; metadataSha256: string; tocPageSha256s: string[]; mappingReview: 'not_reviewed';
  };
};

export const textbookMappingInputSchema = z.object({
  bookId: key, lessonId: key, atomIds: z.array(key).min(1).max(30),
  status: z.enum(['candidate', 'approved', 'rejected']),
  rationale: z.string().trim().min(8).max(2000),
}).strict();
export type TextbookAtomMapping = z.infer<typeof textbookMappingInputSchema> & {
  id: string; bookVersion: string; version: number; reviewerId: string; reviewedAt: string;
};

export type CurriculumRevision = {
  id: string; entityId: string; kind: 'atom' | 'measurement' | 'textbook' | 'package'; version: number;
  actorId: string; at: string; snapshot: unknown;
};

export const curriculumPackageSchema = z.object({
  format: z.literal('study-curriculum-package-v1'), title: z.string().trim().min(3).max(200),
  provenance: z.string().trim().min(10).max(2000),
  atoms: z.array(z.object({ expectedVersion: z.number().int().min(0), atom: knowledgeAtomSchema.strict() }).strict()).min(1).max(2000),
}).strict();
export type CurriculumPackage = z.infer<typeof curriculumPackageSchema>;
export type CurriculumPackagePreview = {
  fileId: string; fileSha256: string; title: string; provenance: string; fingerprint: string;
  total: number; added: number; changed: number; unchanged: number; published: number; draft: number;
  changes: Array<{ id: string; name: string; kind: 'added' | 'changed' | 'unchanged';
    previousVersion: number; nextVersion: number; fields: Array<{ field: string; before: unknown; after: unknown }> }>;
};

/** Read-only material coverage. It is not a student estimate or standardized calibration. */
export type MaterialStructureGap = 'understanding_family_missing' | 'procedure_family_missing' | 'two_basic_families_missing' |
  'two_transfer_families_missing' | 'four_contrast_families_missing';
export type MaterialStructureCoverage = {
  version: 'verification-materials-v1'; familyIdentityVersion: string;
  families: number; understandingFamilies: number; procedureFamilies: number; basicFamilies: number;
  transferFamilies: number; contrastFamilies: number; ready: boolean; gaps: MaterialStructureGap[];
};
export type KnowledgeMaterialCoverage = {
  version: 'verification-materials-v1'; ready: boolean; structure: MaterialStructureCoverage;
  sample: { ready: boolean; ruleVersion: string; itemLimit: number; secondsLimit: number; items: number; expectedSeconds: number;
    groups: Array<{ purpose: string; availableFamilies: number; selectedFamilies: number; requiredFamilies: number; gap?: string }> };
};
