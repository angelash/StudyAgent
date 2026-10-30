import type { DiagnosticSession, LearningScope, KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import { assertControlledPublication, type ControlledContrastPublication } from './controlled-contrast-publication';
import { assertControlledContrastSource } from './controlled-contrast-source';
import type { ControlledContrastBlueprint } from './controlled-contrast-selection';
import { controlledMaterialQuestionSnapshot } from './controlled-material-render';
import { atomDefinitionFingerprint } from './measurement-definition';
import { retentionDigest } from './retention-anchor';
import { isControlledActorIdentity } from './controlled-actor-identity';

export type ControlledDiagnosticSession = DiagnosticSession & {
  controlledContrast: ControlledContrastBlueprint;
  controlledOrigin: { protocol: 'controlled-session-origin-v1'; publicationId: string; publicationFingerprint: string; arrangedBy: string };
};
export function controlledSessionOf(session: DiagnosticSession): ControlledDiagnosticSession | undefined {
  const value = session as Partial<ControlledDiagnosticSession>;
  if (!value.controlledContrast && !value.controlledOrigin) return undefined;
  if (!value.controlledContrast || !value.controlledOrigin) throw Error('controlled_session_saved_original_integrity_failed');
  return session as ControlledDiagnosticSession;
}
type Input = { id: string; arrangedBy: string; startedAt: string; scope: LearningScope; publication: ControlledContrastPublication;
  blueprint: ControlledContrastBlueprint; hypothesisId?: string; allowIncompletePreview?: boolean };

/** Freeze the exact reviewed pair/order without touching mutable source material.
 * Actual access, current availability and server time are supplied by the future
 * service transaction; this module does not register a route or enable a schema.
 */
export function prepareControlledDiagnosticSession(input: Input): ControlledDiagnosticSession {
  const publication = assertControlledPublication(input.publication);
  const blueprint = assertControlledContrastSource(input.blueprint, publication.content,
    packet => publication.originals.some(row => retentionDigest(row.packet) === retentionDigest(packet)));
  if (!input.id || !isControlledActorIdentity(input.arrangedBy) || !Number.isFinite(Date.parse(input.startedAt)) || input.scope.studentId !== blueprint.studentId ||
      input.scope.subject !== blueprint.subject || !input.scope.learnedAtomIds.includes(blueprint.atomId) ||
      Date.parse(input.startedAt) < Date.parse(publication.content.publishedAt) || blueprint.expectedSeconds > Math.min(input.scope.minutesPerSession, 10) * 60 ||
      !input.allowIncompletePreview && !blueprint.fullyCovered) throw Error('controlled_session_original_scope_unavailable');
  const ordered = blueprint.units.flatMap(unit => unit.order);
  const originals = ordered.map(arm => publication.originals.find(row => row.review.id === arm.packet.materialReviewId)!);
  const selected = originals.map(row => structuredClone(row.originals.measurementItems[0]) as MeasurementItem);
  const atomMap = new Map<string, KnowledgeAtom>();
  for (const original of publication.originals) for (const value of original.originals.knowledgeAtoms) {
    const atom = value as KnowledgeAtom, previous = atomMap.get(atom.id);
    if (previous && atomDefinitionFingerprint(previous) !== atomDefinitionFingerprint(atom)) throw Error('controlled_session_original_atom_changed');
    atomMap.set(atom.id, structuredClone(atom));
  }
  const target = atomMap.get(blueprint.atomId);
  if (!target || target.subject !== blueprint.subject || target.grade > input.scope.grade || atomDefinitionFingerprint(target) !== blueprint.definitionFingerprint) throw Error('controlled_session_original_definition_unavailable');
  return {
    id: input.id, studentId: blueprint.studentId, subject: blueprint.subject, intent: 'verification', status: 'in_progress', revision: 1,
    retentionProtocol: 'teaching-retention-v1', scopeSnapshot: structuredClone(input.scope),
    blueprint: { familyIdentityVersion: blueprint.familyIdentityVersion, version: blueprint.protocol,
      title: blueprint.cause === 'language_condition_gap' ? '文字条件核对' : '相关条件选择核对', intent: 'verification',
      focus: '按预先固定的顺序完成成对任务；本组结束后核对任务差异，保留其他解释。',
      itemLimit: blueprint.requiredIndependentUnits * 2, minutesLimit: Math.min(input.scope.minutesPerSession, 10), expectedSeconds: blueprint.expectedSeconds,
      groupSize: 2, stopReason: 'verification_groups', stopRule: '完成原成对任务后查看对照结果；中途不依据首题对错调整另一侧。',
      targetAtomIds: [blueprint.atomId], prerequisiteAtomIds: [], dimensions: [], warnings: [...blueprint.gaps],
      groups: blueprint.units.map((unit, index) => ({ id: unit.unitId, title: '对照单元 ' + (index + 1), itemIds: unit.order.map(arm => arm.packet.itemId) })) },
    itemIds: selected.map(item => item.id), itemSnapshots: selected,
    atomSnapshots: [...atomMap.values()], componentAtomSnapshots: [], questionSnapshots: originals.map(controlledMaterialQuestionSnapshot),
    coverage: [{ atomId: blueprint.atomId, selected: ordered.length, required: blueprint.requiredIndependentUnits * 2, role: 'target',
      available: blueprint.availableIndependentUnits * 2, ...(blueprint.gaps[0] ? { missingReason: blueprint.gaps[0] } : {}) }],
    selectionReasons: Object.fromEntries(blueprint.units.flatMap((unit, index) => unit.order.map((arm, armIndex) => [arm.packet.itemId, '受控对照第 ' + (index + 1) + ' 组 · 第 ' + (armIndex + 1) + ' 题 · 原顺序已固定']))),
    seed: blueprint.seed, algorithmVersion: blueprint.protocol, startedAt: input.startedAt, completedAt: null,
    exposedQuestionIds: [], hypothesisId: input.hypothesisId ?? null, reviewTaskId: null,
    controlledContrast: structuredClone(blueprint), controlledOrigin: { protocol: 'controlled-session-origin-v1',
      publicationId: publication.id, publicationFingerprint: publication.fingerprint, arrangedBy: input.arrangedBy },
  };
}

/** Rebuild all original question/answer/definition fields; a newly hashed public
 * blueprint cannot replace a private original or another child's session.
 */
export function assertControlledDiagnosticSession(session: ControlledDiagnosticSession, publication: ControlledContrastPublication) {
  try {
    if (!['in_progress','paused','completed','aborted'].includes(session.status) || !Number.isSafeInteger(session.revision) || session.revision! < 1 ||
        ['completed','aborted'].includes(session.status) && (!Number.isFinite(Date.parse(session.completedAt ?? session.endedAt ?? '')) || Date.parse(session.completedAt ?? session.endedAt!) < Date.parse(session.startedAt)) ||
        session.controlledOrigin?.protocol !== 'controlled-session-origin-v1' || session.controlledOrigin.publicationId !== publication.id ||
        session.controlledOrigin.publicationFingerprint !== publication.fingerprint || session.intent !== 'verification' || session.routing || session.planId || session.reviewTaskId) throw Error();
    const expected = prepareControlledDiagnosticSession({ id: session.id, arrangedBy: session.controlledOrigin.arrangedBy, startedAt: session.startedAt,
      scope: session.scopeSnapshot, publication, blueprint: session.controlledContrast, ...(session.hypothesisId ? { hypothesisId: session.hypothesisId } : {}) });
    const mutable = new Set(['status', 'revision', 'completedAt', 'endedAt', 'stateHistory']);
    const original = (value: object) => Object.fromEntries(Object.entries(value).filter(([key]) => !mutable.has(key)));
    if (retentionDigest(original(session)) !== retentionDigest(original(expected))) throw Error();
    return session;
  } catch (error) { throw Error('controlled_session_saved_original_integrity_failed', { cause: error }); }
}
