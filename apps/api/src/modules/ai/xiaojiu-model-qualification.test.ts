import type { XiaojiuModelCatalog } from '@study-agent/contracts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalModelJson, modelCatalogFingerprint, modelConnectionFingerprint, projectModelQualification,
  publicModelQualification, readModelQualification, sealModelQualification } from './xiaojiu-model-qualification';

const catalog: XiaojiuModelCatalog = { defaultModel: 'deepseek-v4-flash', models: [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4.1 Flash', catalogLabel: 'DS fixture', description: '匿名目录',
    provider: 'DeepSeek', providerKey: 'deepseek', primary: true, default: true, inputModalities: ['text', 'image'] },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', catalogLabel: 'GPT fixture', description: '匿名目录',
    provider: 'OpenAI', providerKey: 'openai', primary: true, default: false, inputModalities: ['text'] },
] };
const connection = modelConnectionFingerprint({ provider: 'fixture', upstream: 'http://127.0.0.1:1/v1/responses', profile: '/anonymous/profile' });
const start = '2026-10-27T00:00:00.000Z', end = '2026-10-27T00:00:04.000Z', now = Date.parse('2026-10-27T00:00:05.000Z');
function body() { return { version: 1 as const, kind: 'xiaojiu-text-qualification' as const, selection: 'complete-current-application-catalog' as const,
  status: 'complete' as const, startedAt: start, completedAt: end, catalogFingerprint: modelCatalogFingerprint(catalog),
  connectionFingerprint: connection, sourceReceiptSha256: 'a'.repeat(64), models: [
    { id: 'deepseek-v4-flash', status: 'passed' as const, completedAt: '2026-10-27T00:00:02.000Z',
      attempts: [{ attempt: 1, status: 'passed' as const, elapsedMs: 1000 }] },
    { id: 'gpt-6.1-sol', status: 'failed' as const, completedAt: '2026-10-27T00:00:03.000Z',
      attempts: [{ attempt: 1, status: 'failed' as const, elapsedMs: 1000, failureKind: 'provider-error' as const },
        { attempt: 2, status: 'failed' as const, elapsedMs: 1000, failureKind: 'provider-error' as const }] },
  ] }; }
function project(receipt: unknown, extra: Partial<Parameters<typeof projectModelQualification>[1]> = {}, directory = catalog) {
  return projectModelQualification(directory, { receipt, connectionFingerprint: connection, now, ...extra });
}

describe('actual model check receipt boundaries', () => {
  it('shows the original mixed result and timestamps without promoting declared visual input to verified input', () => {
    const receipt = sealModelQualification(body()), result = project(receipt);
    expect(result.textCheck).toMatchObject({ passed: 1, failed: 1, unknown: 0, allModelsPassed: false });
    expect(result.models[0].textCheck).toEqual({ status: 'passed', checkedAt: '2026-10-27T00:00:02.000Z',
      expiresAt: '2026-10-28T00:00:02.000Z', historical: false, reason: null });
    expect(result.models[1].textCheck).toMatchObject({ status: 'failed', reason: 'request-failed' });
    expect(JSON.stringify(result)).not.toContain('visualVerified'); expect(catalog.models[0]).not.toHaveProperty('textCheck');
  });
  it('binds a deterministic catalog independent of grouping order, with exact label, default and modality changes detected', () => {
    const reordered = { ...catalog, models: [...catalog.models].reverse().map(row => ({ ...row, inputModalities: [...row.inputModalities].reverse() })) };
    expect(modelCatalogFingerprint(reordered)).toBe(modelCatalogFingerprint(catalog));
    expect(canonicalModelJson({ z: 2, a: { b: 1, a: 0 } })).toBe(canonicalModelJson({ a: { a: 0, b: 1 }, z: 2 }));
    for (const changed of [ { ...catalog, defaultModel: 'gpt-6.1-sol' },
      { ...catalog, models: catalog.models.map((row, i) => i ? row : { ...row, label: 'Changed label' }) },
      { ...catalog, models: catalog.models.map((row, i) => i ? row : { ...row, inputModalities: ['text'] }) } ])
      expect(project(sealModelQualification(body()), {}, changed).textCheck?.reason).toBe('catalog-changed');
  });
  it('does not carry success into another original provider, profile or unavailable connection', () => {
    for (const key of [null, 'b'.repeat(64), modelConnectionFingerprint({ provider: 'fixture', upstream: 'http://127.0.0.1:1/v1/responses', profile: '/another/profile' })]) {
      const result = project(sealModelQualification(body()), { connectionFingerprint: key });
      expect(result.textCheck).toMatchObject({ reason: 'connection-changed', passed: 0, unknown: 2, allModelsPassed: null });
    }
  });
  it('marks a 24-hour-old result historical while preserving its original success or failure', () => {
    const result = project(sealModelQualification(body()), { now: now + 24 * 60 * 60 * 1000 });
    expect(result.models.map(row => row.textCheck?.historical)).toEqual([true, true]);
    expect(result.models.map(row => row.textCheck?.status)).toEqual(['passed', 'failed']);
  });
  it('rejects rewritten fingerprints, future intervals and unrecognized summary claims', () => {
    const receipt = sealModelQualification(body());
    for (const invalid of [{ ...receipt, receiptFingerprint: 'b'.repeat(64) }, { ...receipt, passedCount: 2 }])
      expect(project(invalid).textCheck?.reason).toBe('report-invalid');
    expect(project(receipt, { now: Date.parse(start) - 1 }).textCheck?.reason).toBe('report-invalid');
  });
  it('rejects duplicate, missing and foreign models even when a new fingerprint has been computed', () => {
    const original = body();
    for (const rows of [[original.models[0], original.models[0]], [original.models[0]],
      [original.models[0], { ...original.models[1], id: 'foreign-model' }]]) {
      const value = sealModelQualification({ ...original, models: rows });
      expect(project(value).textCheck?.reason).toBe('report-invalid');
    }
  });
  it('rejects unaccounted, contradictory and reordered original attempts', () => {
    const original = body();
    for (const row of [{ ...original.models[0], attempts: [] }, { ...original.models[1], status: 'passed' },
      { ...original.models[1], attempts: [...original.models[1].attempts].reverse() }]) {
      const receipt = sealModelQualification({ ...original, models: [row, original.models[row.id === original.models[0].id ? 1 : 0]] });
      expect(project(receipt).textCheck?.reason).toBe('report-invalid');
    }
  });
  it('exports only bounded public fields from a final rechecked original run and retains failed routes', () => {
    const original = body(), raw = { ...original, binding: { catalogFingerprint: original.catalogFingerprint,
      connectionFingerprint: connection, endCatalogFingerprint: original.catalogFingerprint, endConnectionFingerprint: connection, rechecked: true },
      authorization: 'PRIVATE_AUTH_DO_NOT_EXPORT', providerAddress: 'https://private.invalid/route',
      models: original.models.map(row => ({ ...row, prompt: 'PRIVATE_PROMPT_DO_NOT_EXPORT', attempts: row.attempts.flatMap(attempt => [
        { attempt: attempt.attempt, status: 'started', elapsedMs: 0 },
        { ...attempt, status: attempt.status === 'passed' ? 'succeeded' : 'failed' },
      ]) })) };
    const receipt = publicModelQualification(raw, 'a'.repeat(64)), serialized = JSON.stringify(receipt);
    expect(project(receipt).textCheck).toMatchObject({ passed: 1, failed: 1, allModelsPassed: false });
    expect(serialized).not.toMatch(/PRIVATE_|private\.invalid|providerAddress|authorization|prompt/);
    expect(() => publicModelQualification({ ...raw, binding: undefined }, 'a'.repeat(64))).toThrow();
    expect(() => publicModelQualification({ ...raw, status: 'interrupted' }, 'a'.repeat(64))).toThrow();
    expect(() => publicModelQualification({ ...raw, binding: { ...raw.binding, endConnectionFingerprint: 'b'.repeat(64) } }, 'a'.repeat(64))).toThrow();
  });
  it('keeps the catalog usable when the server receipt is absent, malformed or too large', () => {
    const directory = mkdtempSync(join(tmpdir(), 'model-proof-')), file = join(directory, 'check.json');
    try {
      expect(readModelQualification(catalog, { file, connectionFingerprint: connection, now }).textCheck?.reason).toBe('not-checked');
      writeFileSync(file, '{broken'); expect(readModelQualification(catalog, { file, connectionFingerprint: connection, now }).textCheck?.reason).toBe('report-invalid');
      writeFileSync(file, 'x'.repeat(512 * 1024 + 1)); expect(readModelQualification(catalog, { file, connectionFingerprint: connection, now }).models).toHaveLength(2);
      writeFileSync(file, JSON.stringify(sealModelQualification(body()))); expect(readModelQualification(catalog, { file, connectionFingerprint: connection, now }).textCheck?.passed).toBe(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
