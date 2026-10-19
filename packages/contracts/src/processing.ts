export type ImportFile = {
  id: string; ownerUserId: string; requestKey: string; name: string; size: number;
  mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'; chunkSize: number;
  chunks: Array<{ index: number; sha256: string; size: number }>;
  status: 'uploading' | 'ready'; sha256: string | null; createdAt: string; completedAt: string | null;
};
export type ImportPageEvidence = {
  fileId: string; fileSha256: string; pageNumber: number; method: 'pdf_text' | 'ocr' | 'unreadable';
  processorVersion: string; text: string; imageSha256: string; imageUrl: string;
  lines: Array<{ text: string; confidence: number | null; box: number[][] | null }>;
  warnings: string[];
  width: number; height: number; boxSpace: 'pdf_points' | 'image_pixels';
};
export type ImportPageEvidenceRef = { id: string; jobId: string; fileId: string; pageNumber: number;
  relativePath: string; sha256: string; size: number };
export type ProcessingTaskView = {
  id: string; kind: string; state: 'queued' | 'running' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'succeeded' | 'failed';
  attempts: number; maxAttempts: number; generation: number; version: number; createdAt: string; updatedAt: string;
  progress: Record<string, unknown>; result: Record<string, unknown> | null; errorCode: string | null; availableAt: number;
};
export type ProcessingArtifact = { id: string; taskId: string; fileId: string; mediaType: 'image/png' | 'image/jpeg';
  sha256: string; relativePath: string; size: number; createdAt: string; purpose: 'page' | 'handwriting_preview' };
