import type { FoundationDefinition } from './foundation-curriculum';
import { buildAllAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildMathGrade5Grade6ProbeFamilies } from './authored-math-grade5-grade6-probes';
import { buildEnglishFoundationProbeFamilies } from './authored-english-foundation-probes';
import { buildEnglishLexicalProbeFamilies } from './authored-english-lexical-probes';
import { buildEnglishGrade1Grade2ProbeFamilies } from './authored-english-grade1-grade2-probes';
import { buildEnglishGrade3Grade6ProbeFamilies } from './authored-english-grade3-grade6-probes';
import { buildChineseGrade1ProbeFamilies } from './authored-chinese-grade1-probes';
import { buildChineseOralGrade1ProbeFamilies } from './authored-chinese-oral-grade1-probes';
import { buildChineseGrade2ProbeFamilies, buildChineseOralGrade2ProbeFamilies } from './authored-chinese-grade2-probes';
import { buildChineseGrade3ProbeFamilies } from './authored-chinese-grade3-probes';
import { buildChineseGrade4ProbeFamilies } from './authored-chinese-grade4-probes';
import { buildChineseGrade5ProbeFamilies } from './authored-chinese-grade5-probes';
import { buildChineseGrade6ProbeFamilies } from './authored-chinese-grade6-probes';

export function buildAllAuthoredProbeFamilies() {
  return [...buildAllAuthoredMathProbeFamilies(), ...buildMathGrade5Grade6ProbeFamilies(), ...buildEnglishFoundationProbeFamilies(), ...buildEnglishLexicalProbeFamilies(),
    ...buildEnglishGrade1Grade2ProbeFamilies(),
    ...buildEnglishGrade3Grade6ProbeFamilies(),
    ...buildChineseGrade1ProbeFamilies(), ...buildChineseOralGrade1ProbeFamilies(), ...buildChineseGrade2ProbeFamilies(),
    ...buildChineseOralGrade2ProbeFamilies(), ...buildChineseGrade3ProbeFamilies(), ...buildChineseGrade4ProbeFamilies(),
    ...buildChineseGrade5ProbeFamilies(), ...buildChineseGrade6ProbeFamilies()];
}

export function addAuthoredProbes(definitions: FoundationDefinition[]) {
  const byId = new Map(definitions.map(definition => [definition.atom.id, definition]));
  for (const family of buildAllAuthoredProbeFamilies()) {
    const target = byId.get(family.atomId); if (!target) throw new Error(`Authored probe atom missing: ${family.atomId}`);
    target.exercises.push(...family.exercises);
  }
  return definitions;
}
