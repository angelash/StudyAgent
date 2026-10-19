export type PaperPublication = {
  id: string; paperId: string; status: 'published' | 'withdrawn';
  licenseEvidence: string; mediaReviewed: boolean; contentReviewed: boolean;
  reviewerId: string; reviewedAt: string; version: number;
  history: Array<{ at: string; actorId: string; status: string; reason: string }>;
};
export type LibraryBookmark = { id: string; userId: string; paperId: string; createdAt: string };
export type PaperRow = {
  id: string; title: string; grade: string; subject: string; province: string;
  paper_type: string; year: number | null; content_state: string;
  expected: number | null; available: number; missing: number | null;
  pdf_url: string | null; detail_sha256: string; metadata_flags: string;
};
