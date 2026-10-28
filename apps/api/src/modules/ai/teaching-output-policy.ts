export const TEACHING_OUTPUT_POLICY_VERSION = 'teaching-output-policy-v1' as const;

export type TeachingOutputInspection = {
  allowed: boolean;
  version: typeof TEACHING_OUTPUT_POLICY_VERSION;
  reason?: 'unsupported_learner_label' | 'unsupported_learner_cause';
};

// This is a bounded, conservative text check, not a clinical or semantic classifier.
// References, answer exposure and actual learning measurements are checked separately.
const labels = /智力低(?:下)?|注意力缺陷(?:多动障碍)?|ADHD|笨(?:蛋)?|懒惰|确诊|\bstupid\b|\blazy\b|\blow intelligence\b|\bdiagnosed\b/gi;
const learner = /孩子|学生|学习者|小朋友|你|(?:本次|这次|一次|单次).{0,6}(?:作答|答题|错题|测验|测评|表现)|答错|错题|\b(?:child|student|learner|you|your|mistake)\b|wrong answer|single response/i;
const cause = /粗心|先修|基础|注意力|能力|智力|懒|笨|没学|不会|缺乏|ADHD|careless|prerequisite|foundation|attention|ability|intelligence|lazy/i;
const certainty = /一定(?:是|因为|源于|由于)|必然(?:是|因为|源于|由于)|肯定(?:是|因为|源于|由于)|\bmust be\b|\b(?:definitely|certainly) (?:is|are|because)\b|\b(?:is|are) (?:definitely|certainly)\b/gi;
const target = '(?:这个孩子|这名学生|该学生|小朋友|学习者|孩子|学生|你|他|她)?';
const predicate = '(?:就是|是个|是|很|属于|有|患有|为)?';
const inference = '(?:说明|证明|代表|意味着|断定|认定|判断|推断|认为|说|称为|确诊|诊断|等同于|等于)';
const basedInference = '(?:(?:仅凭|根据|凭|因为)[^，,。；;！？\\n]{1,24}(?:就|便))?';
const directDenial = new RegExp('(?:并不是|并非|不是|并不|不代表|不意味着|不等于|不等同于|不)' + target + predicate + '$');
const inferenceDenial = new RegExp('(?:不能|不应|不宜|不要|不足以|无法|不可)(?:据此)?' + basedInference + inference + target + '(?:就是|是|很|为|患有|有)?$');
const doubledDenial = new RegExp('(?:不是|并非|不能|不应|不宜|不要|不足以|无法|不)(?:据此)?' + basedInference + inference + '?' + target + '(?:很|是|真的)?不$');
const englishDenial = /\b(?:not|never)(?:\s+(?:be|being|a|an))?\s*$|\b(?:cannot|can't|does not|doesn't|do not|don't)\s+(?:show|prove|mean|imply|establish|diagnose|conclude|say)(?:\s+that)?(?:\s+(?:the|this|your))?(?:\s+(?:child|student|learner|you))?(?:\s+(?:is|are|has|have|with))?\s*$/i;

function denied(prefix: string, medicalLabel: boolean): boolean {
  const local = prefix.slice(-100).trimEnd();
  if (doubledDenial.test(local) || /\b(?:not|never|cannot|can't).{0,50}\bnot\s*$/i.test(local)) return false;
  if (directDenial.test(local) || inferenceDenial.test(local) || englishDenial.test(local)) return true;
  // The negative operator applies to the act of diagnosis, not to a later action
  // such as "cannot discriminate because the child has ADHD".
  return medicalLabel && (/(?:不能|不应|无法|不可|不要)$/.test(local) ||
    /(?:不能|不可|不应)(?:仅凭|根据|凭)[^，,。；;！？\n]{1,24}(?:就|便)(?:确诊|诊断)?(?:为)?$/.test(local));
}

function technicalTerm(clause: string, start: number): boolean {
  const suffix = clause.slice(start);
  if (/^(?:笨(?:办法|方法|算法)|懒惰(?:求值|加载)|lazy (?:evaluation|loading)\b)/i.test(suffix)) {
    const prefix = clause.slice(0, start);
    return !/(?:孩子|学生|学习者|你|他|她)(?:就是|是个|是|很)\s*$|\b(?:you|child|student|learner)\s+(?:are|is)\s*$/i.test(prefix);
  }
  return false;
}

function neutralMedicalTerm(clause: string): boolean {
  if (learner.test(clause) || /患有|患上|确诊为|被确诊|\bdiagnosed\b/i.test(clause)) return false;
  return /^(?:术语|概念)?(?:ADHD(?:[（(][^）)]{1,80}[）)])?|注意力缺陷(?:多动障碍)?|确诊)(?:是|指|通常指|意为|不代表|不是|不等于)/i.test(clause) ||
    /^(?:ADHD|attention deficit hyperactivity disorder|diagnosis)\s+(?:is|means|stands for|refers to)\b/i.test(clause) ||
    /术语|概念|缩写|\babbreviation\b|\bterm\b/i.test(clause);
}

export function inspectTeachingOutput(text: string): TeachingOutputInspection {
  const normalized = text.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').replace(/[\t\u00a0 ]+/g, ' ');
  for (const sentence of normalized.split(/[。.！？!?；;\n]+/u)) {
    const discussesLearner = learner.test(sentence);
    // Each clause keeps its own negative operator. A disclaimer in another
    // clause cannot erase an affirmative label or a certain cause.
    for (const part of sentence.split(/，|,|但是|然而|不过|而是|只是|因此|所以|但|却/u)) {
      const clause = part.trim();
      if (!clause) continue;
      for (const match of clause.matchAll(labels)) {
        const label = match[0], start = match.index!;
        const medical = /ADHD|注意力缺陷|确诊|diagnosed/i.test(label);
        if (technicalTerm(clause, start) || denied(clause.slice(0, start), medical) || medical && neutralMedicalTerm(clause)) continue;
        return { allowed: false, version: TEACHING_OUTPUT_POLICY_VERSION, reason: 'unsupported_learner_label' };
      }
      if (discussesLearner) for (const match of clause.matchAll(certainty)) {
        if (cause.test(clause.slice(match.index! + match[0].length)) && !denied(clause.slice(0, match.index!), false))
          return { allowed: false, version: TEACHING_OUTPUT_POLICY_VERSION, reason: 'unsupported_learner_cause' };
      }
    }
  }
  return { allowed: true, version: TEACHING_OUTPUT_POLICY_VERSION };
}
