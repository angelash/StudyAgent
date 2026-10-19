import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { CurriculumPackage, CurriculumPackagePreview, KnowledgeAtom, Subject, curriculumPackageSchema } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { ImportFilesService, assertImportAdmin } from '../processing/import-files.service';
import { assertAcyclic, CurriculumService } from './curriculum.service';

const key = z.string().min(1).max(180);
const previewSchema = z.object({ fileId: key }).strict();
const applySchema = z.object({ fileId: key, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  requestKey: z.string().trim().min(8).max(180), reviewed: z.literal(true) }).strict();
const canonical = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => JSON.stringify(key) + ':' + canonical(value)).join(',') + '}';
};
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const withoutVersion = ({ version: _version, ...atom }: KnowledgeAtom) => atom;

@Injectable()
export class CurriculumPackageService {
  constructor(private readonly store: InMemoryStoreService, private readonly curriculum: CurriculumService,
    private readonly files: ImportFilesService, private readonly events: DomainEventBusService) {}

  export(user: InMemoryUserAccount, subject?: Subject): CurriculumPackage {
    this.curriculum.assertEditor(user);
    const atoms = this.store.inspect('knowledgeAtoms').filter(atom => !subject || atom.subject === subject);
    if (!atoms.length) throw new BadRequestException('当前范围暂无可导出的知识定义');
    return { format: 'study-curriculum-package-v1', title: `知识定义快照 · ${subject ?? '全部学科'}`,
      provenance: 'StudyAgent当前知识定义与版本快照；导出不包含题目答案、学生证据、教材全文或题目测量审核。',
      atoms: atoms.map(atom => ({ expectedVersion: atom.version, atom: structuredClone(atom) })) };
  }

  async preview(user: InMemoryUserAccount, input: unknown) {
    assertImportAdmin(user);
    const command = validate(previewSchema, input);
    return (await this.prepare(user, command.fileId)).preview;
  }

  async apply(user: InMemoryUserAccount, input: unknown) {
    assertImportAdmin(user);
    const command = validate(applySchema, input), requestHash = digest(command);
    const receiptId = `curriculum_package:${digest([user.id, command.requestKey])}`;
    const previous = this.store.find('curriculumRevisions', { id: receiptId, kind: 'package' });
    if (previous) {
      const receipt = previous.snapshot as { requestHash: string; result: unknown };
      if (receipt.requestHash !== requestHash) throw new ConflictException('请求键已用于另一份课程导入');
      return receipt.result;
    }
    const prepared = await this.prepare(user, command.fileId);
    if (prepared.preview.fingerprint !== command.fingerprint) throw new ConflictException('知识图已变化，请重新预览并确认差异');
    const changedIds = new Set(prepared.preview.changes.filter(change => change.kind !== 'unchanged').map(change => change.id));
    const definitions = this.curriculum.applyAtomDefinitions(user, prepared.package.atoms.filter(row => changedIds.has(row.atom.id)));
    const result = { fileId: command.fileId, fileSha256: prepared.preview.fileSha256, title: prepared.package.title,
      applied: definitions.length, unchanged: prepared.preview.unchanged, receiptId,
      versions: definitions.map(atom => ({ id: atom.id, version: atom.version })), at: new Date().toISOString() };
    this.store.append('curriculumRevisions', { id: receiptId, entityId: command.fileId, kind: 'package', version: 1,
      actorId: user.id, at: result.at, snapshot: { requestHash, provenance: prepared.package.provenance, fingerprint: command.fingerprint, result } });
    this.events.publish('curriculum.package_applied', { receiptId, fileId: command.fileId, actorId: user.id, applied: result.applied, fileSha256: result.fileSha256 });
    return result;
  }

  private async prepare(user: InMemoryUserAccount, fileId: string) {
    const file = this.files.get(user, fileId);
    if (file.mediaType !== 'application/json' || file.size > 8 * 1024 * 1024) throw new BadRequestException('请选择8MB以内的JSON课程包');
    const { path } = await this.files.readyPath(file.id);
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))); }
    catch { throw new BadRequestException('课程包不是有效的UTF-8 JSON文件'); }
    const content = validate(curriculumPackageSchema, raw), baseline = this.store.inspect('knowledgeAtoms');
    const current = new Map(baseline.map(atom => [atom.id, atom]));
    const incoming = new Set(content.atoms.map(row => row.atom.id));
    if (incoming.size !== content.atoms.length) throw new BadRequestException('课程包内知识标识不能重复');
    const changes: CurriculumPackagePreview['changes'] = content.atoms.map(({ atom, expectedVersion }) => {
      const previous = current.get(atom.id);
      if ((previous?.version ?? 0) !== expectedVersion) throw new ConflictException(`知识点“${atom.name}”的当前版本不同，请导出最新定义后合并`);
      const before = previous ? withoutVersion(previous) : {};
      const after = withoutVersion(atom);
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(field =>
        canonical((before as Record<string, unknown>)[field]) !== canonical((after as Record<string, unknown>)[field]))
        .map(field => ({ field, before: (before as Record<string, unknown>)[field] ?? null, after: (after as Record<string, unknown>)[field] ?? null }));
      return { id: atom.id, name: atom.name, kind: previous ? fields.length ? 'changed' : 'unchanged' : 'added',
        previousVersion: previous?.version ?? 0, nextVersion: (previous?.version ?? 0) + (fields.length ? 1 : 0), fields };
    });
    // A package can add mutually referenced definitions in any order. Validate the
    // final graph before publishing any row, never partially apply an invalid DAG.
    assertAcyclic([...baseline.filter(atom => !incoming.has(atom.id)), ...content.atoms.map(row => row.atom)]);
    const preview: CurriculumPackagePreview = { fileId, fileSha256: file.sha256!, title: content.title, provenance: content.provenance,
      fingerprint: digest({ userId: user.id, fileSha256: file.sha256, baseline: [...baseline].sort((a, b) => a.id.localeCompare(b.id)) }),
      total: changes.length, added: changes.filter(change => change.kind === 'added').length,
      changed: changes.filter(change => change.kind === 'changed').length, unchanged: changes.filter(change => change.kind === 'unchanged').length,
      published: content.atoms.filter(row => row.atom.status === 'published').length, draft: content.atoms.filter(row => row.atom.status === 'draft').length, changes };
    return { package: content, preview };
  }
}
