export type PrivacyCounts = { records: number; observations: number; activities: number; plans: number; conversations: number; accessRecords: number };
export type PrivacyReceipt = {
  id: string; actorId: string; kind: 'account_export' | 'student_export' | 'student_delete' | 'account_delete';
  subjectHash: string; requestKey: string; inputHash: string; completedAt: string; counts: PrivacyCounts;
  erasedStudentHashes?: string[]; retainedStudentHashes?: string[];
};
export type PrivacyOverview = {
  account: { id: string; principal: string; displayName: string };
  children: Array<{ id: string; nickname: string; grade: number; guardianCount: number; canDelete: boolean; counts: PrivacyCounts }>;
  receipts: Array<Omit<PrivacyReceipt, 'actorId' | 'inputHash' | 'requestKey' | 'subjectHash'>>;
  policyVersion: string; retentionNotice: string;
};
export type PrivacyPreview = {
  scope: 'student' | 'account'; subjectId: string; confirmation: string; fingerprint: string; counts: PrivacyCounts;
  canDelete: boolean; blockers: string[]; deletedChildren: Array<{ id: string; nickname: string }>;
  retainedChildren: Array<{ id: string; nickname: string }>; policyVersion: string; retentionNotice: string;
};
export type PrivacyExport = {
  format: 'study-agent-family-export-v1'; exportedAt: string; policyVersion: string;
  account: { id: string; principal: string; displayName: string };
  students: Array<{ id: string; nickname: string; records: Record<string, unknown[]> }>;
  accountRecords: Record<string, unknown[]>; receipt: Omit<PrivacyReceipt, 'inputHash'>; notices: string[];
};
