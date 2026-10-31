import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { PaperLibraryCopyOwner, PaperLibraryJournal } from '@study-agent/contracts';
import { paperLibrarySelectionViewSchema } from '@study-agent/contracts';
import { paperLibraryApplication as application } from './paper-library-app.fixture.spec';
import { paperLibraryJournalEntry } from '../../../../web/lib/paper-library-copy';
import { sendPaperLibraryCommand, type PaperLibraryTransport } from '../../../../web/lib/paper-library-client';
import { ApiRequestError } from '../../../../web/lib/api';

const configured = process.env.STUDY_TEST_PAPER_LIBRARY_UI_POSTGRES_URL;
async function scope(action: (h: any) => Promise<void>) {
  let connectionString: string | undefined;
  if (configured) {
    const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15449' || url.pathname !== '/study_paper_library_ui') throw Error('Exact generated UI PostgreSQL scope required');
    const pool = new Pool({ connectionString: configured, max: 1 }), name = 'library_ui_' + randomUUID().replaceAll('-', '');
    try { await pool.query('CREATE SCHEMA "' + name + '"'); } finally { await pool.end(); } url.searchParams.set('options', '-c search_path=' + name); connectionString = url.toString();
  }
  const old = process.env.STUDY_SEED_FOUNDATION; process.env.STUDY_SEED_FOUNDATION = 'false';
  try { await application(action, { connectionString }); } finally { if (old === undefined) delete process.env.STUDY_SEED_FOUNDATION; else process.env.STUDY_SEED_FOUNDATION = old; }
}
function transport(h: any, token: () => string, calls: Array<{ method: string; actor: string | undefined }>): PaperLibraryTransport {
  return async (path, options) => {
    const method = options.method === 'POST' ? 'post' : 'get', headers = options.headers as Record<string, string> | undefined;
    calls.push({ method, actor: headers?.['X-Study-Actor'] });
    let call = request(h.app.getHttpServer())[method]('/api' + path).set('Authorization', 'Bearer ' + token());
    for (const [key, value] of Object.entries(headers ?? {})) call = call.set(key, value);
    if (options.body !== undefined) call = call.send(JSON.parse(String(options.body)));
    const response = await call; if (response.status >= 400) throw new ApiRequestError(response.body.error?.message ?? 'Actual HTTP request refused', response.status);
    return response.body.data;
  };
}
describe('complete browser command client against actual authenticated ' + (configured ? 'PostgreSQL' : 'SQLite') + ' application HTTP', () => {
  it('binds every POST and original GET to the captured actor, preventing a switched session from saving the old private draft to another account', async () => scope(async h => {
    const first = await h.register('library-ui-first-' + randomUUID()), second = await h.register('library-ui-second-' + randomUUID()), owner: PaperLibraryCopyOwner = { actorId: first.user.id, role: 'parent', scope: { kind: 'private_preparation', studentId: null } };
    const input = { kind: 'create' as const, requestKey: randomUUID(), scope: owner.scope, title: '  原稿仍属于第一个实际账号  ', items: [] }, entry = await paperLibraryJournalEntry(owner, 'selection', input), saved: PaperLibraryJournal[] = [], calls: Array<{ method: string; actor: string | undefined }> = [];
    let token = second.token; const io = transport(h, () => token, calls);
    const refused = await sendPaperLibraryCommand(owner, entry, async value => { saved.push(structuredClone(value)); }, undefined, io);
    expect(refused.verified).toBe(false); expect(refused.entry.result).toBeNull(); expect(refused.entry.input).toEqual(input); expect(calls.map(row => row.actor)).toEqual([first.user.id, first.user.id]);
    expect(await h.store.requestContext(() => h.store.inspect('paperSelectionLists'))).toHaveLength(0); expect(await h.store.requestContext(() => h.store.inspect('paperSelectionCommands'))).toHaveLength(0);
    token = first.token; const accepted = await sendPaperLibraryCommand(owner, refused.entry, async value => { saved.push(structuredClone(value)); }, undefined, io);
    expect(accepted.verified).toBe(true); const current = paperLibrarySelectionViewSchema.parse(accepted.current); expect(current.scope).toEqual(owner.scope); expect(current.title).toBe(input.title); expect(current.revision).toBe(1);
    const state = (await h.cold()).state; expect(state.paperSelectionLists).toHaveLength(1); expect(state.paperSelectionCommands).toHaveLength(1); expect(state.paperSelectionCommands[0].input).toEqual(input); expect(state.paperSelectionLists[0].actorId).toBe(first.user.id); expect(calls.every(row => row.actor === first.user.id)).toBe(true);
    expect(saved[0].phase).toBe('unknown'); expect(saved[0].input).toEqual(input);
  }), 120000);
  it('uses a real learning-code identity and preserves the original full command when actual guardian revocation wins before a second save', async () => scope(async h => {
    const parent = await h.register('library-ui-guardian-' + randomUUID()), child = (await h.api(parent.token, 'post', '/students', { nickname: '合成本人界面档案', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await h.api(parent.token, 'post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '独立工程验证本人完整原请求与撤权边界' });
    const code = await h.api(parent.token, 'post', `/students/${child.id}/learning-access/codes`, { expectedVersion: 1, requestKey: randomUUID() }), learner = await h.api(null, 'post', '/auth/learning-code', { code: code.code });
    const owner: PaperLibraryCopyOwner = { actorId: learner.user.id, role: 'student', scope: { kind: 'student_self', studentId: child.id } }, first = await paperLibraryJournalEntry(owner, 'selection', { kind: 'create', requestKey: randomUUID(), scope: owner.scope, title: '本人原空清单', items: [] }), calls: Array<{ method: string; actor: string | undefined }> = [], io = transport(h, () => learner.token, calls);
    const accepted = await sendPaperLibraryCommand(owner, first, async () => {}, undefined, io); expect(accepted.verified).toBe(true); expect(paperLibrarySelectionViewSchema.parse(accepted.current).scope).toEqual(owner.scope);
    await h.api(parent.token, 'post', `/students/${child.id}/learning-access`, { enabled: false, expectedVersion: 1, requestKey: randomUUID(), reason: '在第二份完整原命令之前实际撤回监护学习资格' });
    const second = await paperLibraryJournalEntry(owner, 'selection', { kind: 'create', requestKey: randomUUID(), scope: owner.scope, title: '  撤权后仍保留的全部原输入  ', items: [] }), retained: PaperLibraryJournal[] = [];
    const refused = await sendPaperLibraryCommand(owner, second, async value => { retained.push(structuredClone(value)); }, undefined, io); expect(refused.verified).toBe(false); expect(refused.entry.input).toEqual(second.input); expect(refused.entry.result).toBeNull();
    const state = (await h.cold()).state; expect(state.paperSelectionLists).toHaveLength(1); expect(state.paperSelectionCommands).toHaveLength(1); expect(state.paperSourceExposures ?? []).toHaveLength(0); expect(retained[0].input).toEqual(second.input); expect(calls.every(row => row.actor === learner.user.id)).toBe(true);
  }), 120000);
});
