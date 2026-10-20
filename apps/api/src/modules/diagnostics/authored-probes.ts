import type { FoundationDefinition } from './foundation-curriculum';
import { buildAllAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildEnglishFoundationProbeFamilies } from './authored-english-foundation-probes';

export function buildAllAuthoredProbeFamilies() {
  return [...buildAllAuthoredMathProbeFamilies(), ...buildEnglishFoundationProbeFamilies()];
}

export function addAuthoredProbes(definitions: FoundationDefinition[]) {
  const byId = new Map(definitions.map(definition => [definition.atom.id, definition]));
  for (const family of buildAllAuthoredProbeFamilies()) {
    const target = byId.get(family.atomId); if (!target) throw new Error(`Authored probe atom missing: ${family.atomId}`);
    target.exercises.push(...family.exercises);
  }
  return definitions;
}
