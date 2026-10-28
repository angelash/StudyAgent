/** Authored, bounded models. No scripts, remote resources or learner-score inference. */
export type ClassroomExperimentKind = 'particle-change' | 'air-mixture' | 'catalysis' | 'atom-ion' | 'filtration' |
  'water-electrolysis' | 'mass-conservation' | 'balance-water' | 'co2-test' | 'combustion';
export type ClassroomExperiment = {
  kind: ClassroomExperimentKind;
  title: string;
  prediction: { question: string; options: string[] };
  observation: string;
  explanation: string;
  limitation: string;
};
