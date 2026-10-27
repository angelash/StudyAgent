import type { XiaojiuModelCatalog, XiaojiuTextCheckReason } from '@study-agent/contracts';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const validForMs = 24 * 60 * 60 * 1000, maxReceiptBytes = 512 * 1024;
const digest = z.string().regex(/^[a-f0-9]{64}$/), timestamp = z.string().datetime();
const attemptSchema = z.object({ attempt: z.number().int().min(1).max(2), status: z.enum(['passed', 'failed']),
  elapsedMs: z.number().int().nonnegative().max(600_000),
  failureKind: z.enum(['cancelled', 'invalid-output', 'provider-error']).optional() }).strict();
const receiptBodySchema = z.object({ version: z.literal(1), kind: z.literal('xiaojiu-text-qualification'),
  selection: z.literal('complete-current-application-catalog'), status: z.literal('complete'),
  startedAt: timestamp, completedAt: timestamp, catalogFingerprint: digest, connectionFingerprint: digest,
  sourceReceiptSha256: digest, models: z.array(z.object({ id: z.string().min(1).max(180), status: z.enum(['passed', 'failed']),
    completedAt: timestamp, attempts: z.array(attemptSchema).max(2) }).strict()).min(1).max(100) }).strict();
const receiptSchema = receiptBodySchema.extend({ receiptFingerprint: digest });
export type ModelQualificationReceipt = z.infer<typeof receiptSchema>;

export function canonicalModelJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalModelJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a === b ? 0 : a < b ? -1 : 1)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonicalModelJson(item)).join(',') + '}';
  const result = JSON.stringify(value); if (result === undefined) throw Error('Unsupported model receipt value'); return result;
}
export const modelDigest = (value: unknown) => createHash('sha256').update(canonicalModelJson(value)).digest('hex');

export function modelCatalogFingerprint(catalog: XiaojiuModelCatalog) {
  return modelDigest({ defaultModel: catalog.defaultModel, models: catalog.models.map(model => ({ id: model.id,
    label: model.label, catalogLabel: model.catalogLabel, providerKey: model.providerKey,
    inputModalities: [...new Set(model.inputModalities)].sort() })).sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1) });
}

/** The original address/profile are hashed only; neither enters a public receipt or response. */
export function modelConnectionFingerprint(input: { provider: string; upstream: string; profile: string }) {
  return modelDigest({ provider: input.provider, upstream: input.upstream, profile: input.profile });
}

export function sealModelQualification(value: unknown): ModelQualificationReceipt {
  const body = receiptBodySchema.parse(value);
  return { ...body, receiptFingerprint: modelDigest(body) };
}

function checkedReceipt(value: unknown) {
  const parsed = receiptSchema.parse(value), { receiptFingerprint, ...body } = parsed;
  if (modelDigest(body) !== receiptFingerprint) throw Error('Model receipt fingerprint differs');
  const start = Date.parse(parsed.startedAt), end = Date.parse(parsed.completedAt);
  if (end < start) throw Error('Model receipt interval differs');
  const seen = new Set<string>();
  for (const row of parsed.models) {
    if (seen.has(row.id) || Date.parse(row.completedAt) < start || Date.parse(row.completedAt) > end)
      throw Error('Model receipt row differs');
    seen.add(row.id);
    if (row.attempts.some((attempt, index) => attempt.attempt !== index + 1 ||
        attempt.status === 'passed' && (index !== row.attempts.length - 1 || attempt.failureKind !== undefined) ||
        attempt.status === 'failed' && !attempt.failureKind)) throw Error('Model attempts differ');
    const last = row.attempts.at(-1);
    if (row.status === 'passed' && last?.status !== 'passed' || row.status === 'failed' && last?.status === 'passed')
      throw Error('Model result differs from its original attempts');
  }
  return parsed;
}

/** Convert only a final, identity-rechecked original run. Never publish a mutable progress file. */
export function publicModelQualification(original: unknown, sourceReceiptSha256: string): ModelQualificationReceipt {
  const raw = z.object({ status: z.literal('complete'), selection: z.literal('complete-current-application-catalog'),
    startedAt: timestamp, completedAt: timestamp,
    binding: z.object({ catalogFingerprint: digest, connectionFingerprint: digest, endCatalogFingerprint: digest,
      endConnectionFingerprint: digest, rechecked: z.literal(true) }).strict(),
    models: z.array(z.object({ id: z.string(), status: z.enum(['passed', 'failed']), completedAt: timestamp,
      attempts: z.array(z.object({ attempt: z.number().int(), status: z.enum(['started', 'succeeded', 'failed']),
        elapsedMs: z.number(), failureKind: z.enum(['cancelled', 'invalid-output', 'provider-error']).optional() }).strict()) }).passthrough()).min(1).max(100),
  }).passthrough().parse(original);
  if (raw.binding.catalogFingerprint !== raw.binding.endCatalogFingerprint || raw.binding.connectionFingerprint !== raw.binding.endConnectionFingerprint)
    throw Error('Model run identity changed');
  const models = raw.models.map(row => {
    const starts = row.attempts.filter(attempt => attempt.status === 'started'), ends = row.attempts.filter(attempt => attempt.status !== 'started');
    if (starts.length !== ends.length || starts.some((start, index) => start.attempt !== index + 1 || ends[index].attempt !== start.attempt) ||
        row.attempts.some((attempt, index) => index % 2 === 0 ? attempt.status !== 'started' : attempt.status === 'started'))
      throw Error('An original model attempt was not accounted for');
    return { id: row.id, status: row.status, completedAt: row.completedAt, attempts: ends.map(attempt => ({
      attempt: attempt.attempt, status: attempt.status === 'succeeded' ? 'passed' as const : 'failed' as const,
      elapsedMs: attempt.elapsedMs, ...(attempt.failureKind ? { failureKind: attempt.failureKind } : {}) })) };
  }).sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
  return checkedReceipt(sealModelQualification({ version: 1, kind: 'xiaojiu-text-qualification', selection: raw.selection, status: raw.status,
    startedAt: raw.startedAt, completedAt: raw.completedAt, catalogFingerprint: raw.binding.catalogFingerprint,
    connectionFingerprint: raw.binding.connectionFingerprint, sourceReceiptSha256, models }));
}

export function projectModelQualification(catalog: XiaojiuModelCatalog, input: {
  receipt?: unknown; connectionFingerprint: string | null; now?: number; unavailableReason?: XiaojiuTextCheckReason;
}): XiaojiuModelCatalog {
  const unknown = (reason: XiaojiuTextCheckReason): XiaojiuModelCatalog => ({ ...catalog,
    models: catalog.models.map(model => ({ ...model, textCheck: { status: 'unknown', checkedAt: null, expiresAt: null, historical: false, reason } })),
    textCheck: { scope: 'anonymous-text-json', receiptFingerprint: null, completedAt: null, passed: 0, failed: 0,
      unknown: catalog.models.length, allModelsPassed: null, reason } });
  if (input.receipt === undefined) return unknown(input.unavailableReason ?? 'not-checked');
  let receipt: ModelQualificationReceipt;
  try { receipt = checkedReceipt(input.receipt); } catch { return unknown('report-invalid'); }
  const now = input.now ?? Date.now();
  if (Date.parse(receipt.completedAt) > now || Date.parse(receipt.startedAt) > now) return unknown('report-invalid');
  if (new Set(catalog.models.map(model => model.id)).size !== catalog.models.length || receipt.catalogFingerprint !== modelCatalogFingerprint(catalog))
    return unknown('catalog-changed');
  if (!input.connectionFingerprint || receipt.connectionFingerprint !== input.connectionFingerprint) return unknown('connection-changed');
  const rows = new Map(receipt.models.map(row => [row.id, row]));
  if (rows.size !== catalog.models.length || catalog.models.some(model => !rows.has(model.id))) return unknown('report-invalid');
  const passed = receipt.models.filter(row => row.status === 'passed').length, failed = receipt.models.length - passed;
  return { ...catalog, models: catalog.models.map(model => { const row = rows.get(model.id)!;
    const expiresAt = new Date(Date.parse(row.completedAt) + validForMs).toISOString();
    return { ...model, textCheck: { status: row.status, checkedAt: row.completedAt, expiresAt,
      historical: Date.parse(expiresAt) <= now, reason: row.status === 'failed' ? 'request-failed' : null } };
  }), textCheck: { scope: 'anonymous-text-json', receiptFingerprint: receipt.receiptFingerprint, completedAt: receipt.completedAt,
    passed, failed, unknown: 0, allModelsPassed: failed === 0, reason: null } };
}

export function readModelQualification(catalog: XiaojiuModelCatalog, input: { file: string; connectionFingerprint: string | null; now?: number }) {
  try {
    if (!existsSync(input.file)) return projectModelQualification(catalog, { ...input, unavailableReason: 'not-checked' });
    const stat = lstatSync(input.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxReceiptBytes) throw Error('Invalid model check file');
    const bytes = readFileSync(input.file); if (bytes.length > maxReceiptBytes) throw Error('Model check file too large');
    return projectModelQualification(catalog, { ...input, receipt: JSON.parse(bytes.toString('utf8')) });
  } catch { return projectModelQualification(catalog, { ...input, unavailableReason: 'report-invalid' }); }
}
