import type { FoundationDefinition } from './foundation-curriculum';
import { buildAllAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildEnglishFoundationProbeFamilies } from './authored-english-foundation-probes';
import { buildEnglishLexicalProbeFamilies } from './authored-english-lexical-probes';
import { buildChineseGrade1ProbeFamilies } from './authored-chinese-grade1-probes';
import { buildChineseOralGrade1ProbeFamilies } from './authored-chinese-oral-grade1-probes';

export function buildAllAuthoredProbeFamilies() {
  return [...buildAllAuthoredMathProbeFamilies(), ...buildEnglishFoundationProbeFamilies(), ...buildEnglishLexicalProbeFamilies(),
    ...buildChineseGrade1ProbeFamilies(), ...buildChineseOralGrade1ProbeFamilies()];
}

export function addAuthoredProbes(definitions: FoundationDefinition[]) {
  const byId = new Map(definitions.map(definition => [definition.atom.id, definition]));
  for (const family of buildAllAuthoredProbeFamilies()) {
    const target = byId.get(family.atomId); if (!target) throw new Error(`Authored probe atom missing: ${family.atomId}`);
    target.exercises.push(...family.exercises);
  }
  return definitions;
}
