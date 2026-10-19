import { z } from 'zod';

export const studentMediaTargetSchema = z.object({ kind: z.enum(['diagnostic', 'practice']), sessionId: z.string().min(1).max(180), itemId: z.string().min(1).max(180) }).strict();
export type StudentMediaTarget = z.infer<typeof studentMediaTargetSchema>;
export const studentMediaStartSchema = studentMediaTargetSchema.extend({ requestKey: z.string().min(8).max(180), name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(12 * 1024 * 1024), mediaType: z.enum(['image/png', 'image/jpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4']) }).strict();
export type StudentMedia = StudentMediaTarget & { id: string; studentId: string; questionId: string; ownerUserId: string; requestKey: string;
  name: string; mediaType: z.infer<typeof studentMediaStartSchema>['mediaType']; size: number; chunkSize: number;
  chunks: Array<{ index: number; sha256: string; size: number }>; status: 'uploading' | 'ready' | 'cancelled' | 'expired'; sha256: string | null; receivedSha256: string | null;
  storedSize: number | null; storedType: 'image/png' | 'audio/wav' | null; width?: number; height?: number; durationMs?: number;
  createdAt: string; completedAt: string | null; references: Array<{ responseId: string; at: string }>; normalizationVersion?: string };
export type StudentMediaView = Omit<StudentMedia, 'ownerUserId' | 'requestKey' | 'receivedSha256'> & { url: string | null };
