import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-6974-v1.json';
import { buildChineseGrade1ProbeFamilies } from './authored-chinese-grade1-probes';
import { buildAllAuthoredProbeFamilies } from './authored-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { knowledgeMaterialCoverage } from './verification-materials';
import { gradeResponse } from './scoring';

const families = buildChineseGrade1ProbeFamilies(), tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });
const initialOf: Record<string, string> = { mā: 'm', bā: 'b', pā: 'p', fā: 'f', dā: 'd', tā: 't', nā: 'n', lā: 'l', gā: 'g', kā: 'k', hā: 'h', jī: 'j' };
const toneOf: Record<string, string> = { mā: '第一声', má: '第二声', mǎ: '第三声', mà: '第四声', bā: '第一声', bá: '第二声',
  bǎ: '第三声', bà: '第四声', gē: '第一声', gé: '第二声', gě: '第三声', gè: '第四声' };
const radicalOf: Record<string, string> = { 河: '氵', 树: '木', 他: '亻', 吗: '口', 花: '艹', 林: '木', 妈: '女', 请: '讠', 江: '氵', 喵: '口', 锋: '钅', 校: '木' };
const structureOf: Record<string, string> = { 林: '左右结构', 尖: '上下结构', 休: '左右结构', 苗: '上下结构', 口: '独体字', 山: '独体字',
  从: '左右结构', 看: '上下结构', 星: '上下结构', 秋: '左右结构', 明: '左右结构', 架: '上下结构' };
const oppositeOf: Record<string, string> = { 大: '小', 上: '下', 开: '关', 白天: '黑夜', 高: '低', 长: '短', 前: '后', 冷: '热',
  多: '少', 快: '慢', 远: '近', 新: '旧', 满: '空', 里面: '外面' };
const classifierOf: Record<string, string> = { 书: '本', 笔: '支', 鱼: '条', 树: '棵', 鸟: '只', 纸: '张', 花: '朵', 衣服: '件', 鞋: '双', 钥匙: '把', 伞: '把', 马: '匹' };

describe('Chinese grade-one written contrasts reconstructed from actual records', () => {
  it('preserves all 6974 historical objects and IDs and appends 576 unique tasks in 48 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previousIds = new Set(baseline.ids), previous = all.filter(row => previousIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(6974); expect(baseline.sha256).toBe('64e113ac60d6e5adcb20139475a5d338af1d918bdf41f02d264b910abde24bc3');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(15758); expect(new Set(all.map(row => row.id)).size).toBe(15758);
    expect(families).toHaveLength(48); expect(new Set(families.map(row => row.atomId)).size).toBe(12);
    expect(families.reduce((count, family) => count + family.exercises.length, 0)).toBe(576);
    for (const family of families) expect(new Set(family.exercises.map(task => foundationQuestionId(family.atomId, task))).size).toBe(12);
  });
  it('covers every written grade-one Chinese point and keeps the oral point outside written probes', () => {
    const expected = ['foundation:chinese:g1-cause', 'foundation:chinese:g1-locate', 'core:chinese:antonym', 'core:chinese:classifier',
      'core:chinese:complete-sentence', 'core:chinese:eventorder', 'core:chinese:initial', 'core:chinese:person', 'core:chinese:questionmark',
      'core:chinese:radical', 'core:chinese:structure', 'core:chinese:tone']; expect(new Set(families.map(row => row.atomId))).toEqual(new Set(expected));
    expect(expected.every(id => !id.includes('oral'))).toBe(true);
    for (const atomId of expected) {
      const group = families.filter(row => row.atomId === atomId);
      expect(group.map(row => row.dimension).sort()).toEqual(['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.structure.includes('→') && row.distinction.length > 15)).toBe(true);
    }
    expect(buildAllAuthoredProbeFamilies().filter(row => expected.includes(row.atomId))).toEqual(families);
  });
  it('reconstructs location from statements, two-event tables, latest updates and all matching rows', () => {
    for (const task of tasks('locate-structure-0')) expect(task.stem).toContain(`在${task.answer}`);
    for (const task of tasks('locate-structure-1')) for (const value of Object.values(entries(task))) expect(task.stem).toContain(value);
    for (const task of tasks('locate-updated-plan')) { const update = rows(task)[1]; expect(task.answer).toBe(update[1]); expect(task.options).not.toEqual([task.answer]); }
    for (const task of tasks('locate-multi-event-table')) {
      const target = task.stem.match(/发生在(.+?)的活动/)![1], expected = rows(task).filter(row => row[1] === target).map(row => row[2]);
      expect(new Set(task.answer as string[])).toEqual(new Set(expected)); expect(expected).toHaveLength(2);
    }
  });
  it('keeps cause and result direction under syntax, table and two-chain contrast', () => {
    for (const task of tasks('cause-syntax-0')) expect(task.answer).toBe(task.stem.match(/因为(.+)，所以/)![1]);
    for (const task of tasks('cause-syntax-1')) { const answers = entries(task); expect(Object.keys(answers)).toEqual(['c0', 'c1', 'c2']);
      for (const cause of Object.values(answers)) expect(task.stem + JSON.stringify(task.blocks)).toContain(cause); }
    const resultCauses: Record<string, string> = { 地面湿滑: '刚洒过水', 比赛延期: '场地积水', 纸船翻: '风很大', 叶子变软: '缺水', 公交改走北路: '桥面检修',
      大家加快脚步: '即将上课', 工具盒打开: '需要找尺子', 分组重新调整: '人数减少', 纸牌被收起: '风变大了', 书页补上修补贴: '书页破损',
      桌面被擦干: '刚才洒了水', 队伍停下来: '前方正在检修' };
    for (const task of tasks('cause-result-reverse')) { const result = task.stem.match(/记录显示“([^”]+)”/)![1]; expect(task.answer).toBe(resultCauses[result]); }
    for (const task of tasks('cause-pair-table')) { const asked = task.stem.match(/只问“([^”]+)”/)![1], expected = rows(task).find(row => row[1] === asked)![0]; expect(task.answer).toBe(expected); }
  });
  it('compares actual written syllable starts and the complete common-initial group', () => {
    for (const task of tasks('syllable-initial')) { const syllable = task.stem.match(/音节“([^”]+)”/)![1]; expect(task.answer).toBe(initialOf[syllable]); }
    for (const task of tasks('sound-role')) expect(entries(task)).toEqual(Object.fromEntries(rows(task).map((row, i) => [`s${i}`, initialOf[row[1]]])));
    for (const task of tasks('initial-record-check')) {
      const expected = rows(task).filter(row => initialOf[row[1]] === row[2]).map(row => row[0]); expect(new Set(task.answer as string[])).toEqual(new Set(expected));
      expect(expected.length).toBeLessThan(4);
    }
    for (const task of tasks('initial-group-common')) {
      const list = task.stem.match(/音节是“([^”]+)”/)![1].split('、'), starts = list.map(syllable => syllable.startsWith('m') ? 'm' : syllable.startsWith('b') ? 'b' : syllable.startsWith('d') ? 'd' : syllable.startsWith('l') ? 'l' : syllable[0]);
      const common = starts.find(start => starts.filter(value => value === start).length === 3)!; expect(entries(task).common).toBe(common);
      expect(entries(task).odd).toBe(list[starts.findIndex(start => start !== common)]);
    }
  });
  it('checks every written tone against actual marks and repairs the sole mislabeled record', () => {
    for (const task of tasks('tone-symbol')) { const syllable = task.stem.match(/音节“([^”]+)”/)![1]; expect(task.answer).toBe(toneOf[syllable]); }
    for (const task of tasks('word-tone')) expect(entries(task)).toEqual(Object.fromEntries(rows(task).map((row, i) => [`t${i}`, toneOf[row[1]]])));
    for (const task of tasks('tone-card-check')) {
      const expected = rows(task).filter(row => toneOf[row[1]] === row[2]).map(row => row[0]); expect(new Set(task.answer as string[])).toEqual(new Set(expected));
      expect(expected.length).toBeLessThan(4);
    }
    for (const task of tasks('tone-record-repair')) {
      const wrong = rows(task).filter(row => toneOf[row[1]] !== row[2]); expect(wrong).toHaveLength(1);
      expect(entries(task)).toEqual({ row: wrong[0][0], tone: toneOf[wrong[0][1]] });
    }
  });
  it('reconstructs radicals from stated parts, classifies finite cards and repairs one row', () => {
    for (const task of tasks('radical-extract')) { const char = task.stem.match(/汉字“(.+)”/)![1]; expect(task.answer).toBe(radicalOf[char]); }
    for (const task of tasks('radical-select')) { const part = task.stem.match(/带“(.+)”偏旁/)![1]; expect(new Set(task.answer as string[])).toEqual(new Set(task.options!.filter(char => radicalOf[char] === part))); }
    for (const task of tasks('radical-layout-repair')) {
      const wrong = rows(task).filter(row => radicalOf[row[1]] !== row[3]); expect(wrong).toHaveLength(1); expect(entries(task)).toEqual({ row: wrong[0][0], radical: radicalOf[wrong[0][1]] });
    }
    for (const task of tasks('radical-stock-complete')) {
      const config = answerInputConfiguration(schemaFor('core:chinese:radical', task)); const pairs = config.left.map(char => ({ left: char.id,
        right: config.right.find(part => radicalOf[char.label] === part.label)!.id })); expect(gradeResponse(schemaFor('core:chinese:radical', task), task.answer, { pairs }).score).toBe(1);
    }
  });
  it('compares described parts, full-character structure and every finite-label candidate', () => {
    for (const task of tasks('structure-described')) { const char = task.stem.match(/“(.+)”的主要部件/)![1]; expect(task.answer).toBe(structureOf[char]); }
    for (const task of tasks('structure-word')) expect(entries(task)).toEqual(Object.fromEntries(rows(task).map((row, i) => [`s${i}`, structureOf[row[1]]])));
    for (const task of tasks('structure-table-repair')) {
      const wrong = rows(task).filter(row => structureOf[row[1]] !== row[3]); expect(wrong).toHaveLength(1); expect(entries(task)).toEqual({ row: wrong[0][0], layout: structureOf[wrong[0][1]] });
    }
    for (const task of tasks('structure-label-stock')) { const layout = task.stem.match(/结构为“(.+)”的/)![1];
      expect(new Set(task.answer as string[])).toEqual(new Set(task.options!.filter(char => structureOf[char] === layout))); }
  });
  it('uses actual same-dimension opposites and tracks an event result before selecting its opposite', () => {
    for (const task of tasks('opposite-isolated')) { const word = task.stem.match(/与“(.+)”在/)![1]; expect(task.answer).toBe(oppositeOf[word]); }
    const contextAnswers: Record<string, string> = { 关: '关', 窄: '窄', 黑夜: '黑夜', 空: '空', 后: '后', 热: '热', 多: '多', 慢: '慢', 远: '远', 新: '新', 低: '低', 长: '长' };
    for (const task of tasks('opposite-context')) for (const answer of Object.values(entries(task))) expect(contextAnswers[answer]).toBe(answer);
    for (const task of tasks('opposite-dimension-check')) {
      const valid = task.options!.filter(option => { const [left, right] = option.split('—'); return oppositeOf[left] === right; }); expect(valid).toEqual([task.answer]);
    }
    for (const task of tasks('opposite-event-result')) {
      const current = rows(task)[1][1]; const source = Object.keys(oppositeOf).find(word => oppositeOf[word] === current)!;
      expect(task.answer).toBe(source);
    }
  });
  it('checks classifier phrases, repairs one row and includes event count with preserved unit meaning', () => {
    for (const task of tasks('classifier-blank')) { const item = task.stem.match(/一____(.+)，/)![1]; expect(task.answer).toBe(classifierOf[item]); }
    for (const task of tasks('classifier-judgment')) expect(entries(task)).toEqual(Object.fromEntries(rows(task).map((row, i) => [`q${i}`, classifierOf[row[1]]])));
    for (const task of tasks('classifier-record-repair')) {
      const wrong = rows(task).filter(row => classifierOf[row[3]] !== row[2]); expect(wrong).toHaveLength(1); expect(entries(task)).toEqual({ row: wrong[0][0], amount: classifierOf[wrong[0][3]] });
    }
    for (const task of tasks('classifier-count-record')) {
      const records = rows(task), initial = Number(records[0][3]), added = Number(records[1][3]), removed = Number(records[2][3]); const final = initial + added - removed;
      expect(entries(task).count).toBe(['一', '二', '三', '四', '五'][final - 1]); expect(entries(task).amount).toBe(classifierOf[records[0][1]]);
    }
  });
  it('distinguishes direct questions, statements and exclamations across single and tabular forms', () => {
    for (const task of tasks('question-name')) expect(task.stem).toMatch(/直接向对方询问/);
    for (const task of tasks('question-time')) {
      const expected = ['。', '？', '！']; rows(task).forEach((row, i) => expect(entries(task)[`p${i}`]).toBe(expected[i]));
    }
    for (const task of tasks('punctuation-function')) { const pairs = task.options!.filter(option => option.endsWith('？')); expect(pairs).toEqual([task.answer]); }
    for (const task of tasks('dialogue-mark-repair')) {
      const funcs = (sentence: string) => /吗|哪里|几|谁|什么/.test(sentence) ? '？' : /真|很/.test(sentence) ? '！' : '。';
      const wrong = rows(task).filter(row => funcs(row[1]) !== row[2]); expect(wrong).toHaveLength(1); expect(entries(task)).toEqual({ row: wrong[0][0], mark: funcs(wrong[0][1]) });
    }
  });
  it('tracks actor, recipient, reversed syntax and the final holder of a handoff chain', () => {
    for (const task of tasks('two-person-selection')) { const asked = task.stem.match(/谁在(.+？)/)![1].replace('？', ''); expect(task.stem).toContain(`也在这里${asked}`); }
    for (const task of tasks('focus-sentence')) { const match = task.stem.match(/^(.+?)在.+?把.+?交给(.+?)。/)!; expect(entries(task)).toEqual({ sender: match[1], receiver: match[2] }); }
    for (const task of tasks('person-role-reversal')) { const match = task.stem.match(/.+，.+?由(.+?)交给(.+?)。/)!; expect(task.answer).toBe(match[2]); }
    for (const task of tasks('person-handoff-chain')) expect(task.answer).toBe(rows(task).at(-1)![2]);
  });
  it('keeps two-step order, corrected number order and latest revised sequence distinct', () => {
    for (const task of tasks('first-event')) { const first = task.stem.match(/先(.+)，再/)![1]; expect(first).toBe(task.answer); }
    for (const task of tasks('later-event')) { const pair = task.stem.match(/“(.+)以后，才(.+)”/)!; expect(entries(task)).toEqual({ first: pair[1], later: pair[2] }); }
    const precedence: Record<string, number> = { 洗手: 1, 吃饭: 2, 读题: 1, 答题: 2, 穿袜: 1, 穿鞋: 2 };
    for (const task of tasks('event-order-repair')) {
      const wrong = rows(task).filter(row => precedence[row[2]] > precedence[row[3]]); expect(wrong).toHaveLength(1);
      expect(entries(task)).toEqual({ row: wrong[0][0], first: wrong[0][3] });
    }
    for (const task of tasks('event-updated-sequence')) { const final = rows(task)[1][1].split('→'); expect(task.answer).toBe(final[0]); expect(task.answer).not.toBe(rows(task)[0][1].split('→')[0]); }
  });
  it('uses frozen rubrics for complete constructions and reference-only short-answer scoring', () => {
    for (const task of tasks('source-based-production')) expect(task.stem).toMatch(/哪一句完整/);
    for (const family of families.filter(row => ['personal-production', 'sentence-repair', 'sentence-event-table'].includes(row.family))) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task); expect(task.mode).toBe('short_answer'); expect(task.rubric).toHaveLength(3); expect(answerInputConfiguration(schema).supported).toBe(true);
      expect(gradeResponse(schema, task.answer, task.answer)).toMatchObject({ score: null, correct: null, status: 'pending_review' }); expect(String(task.answer)).toMatch(/[。！？]$/);
    }
  });
  it('accepts every objective standard through its supported persistent-schema shape', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode !== 'short_answer')) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported, task.stem).toBe(true); expect(gradeResponse(schema, task.answer, task.answer).score, task.stem).toBe(1);
    }
  });
  it('provides a legal zero-score response for every objective family', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode !== 'short_answer')) {
      const schema = schemaFor(family.atomId, task); let wrong: unknown;
      if (task.mode === 'boolean') wrong = !task.answer;
      else if (task.mode === 'single_choice') wrong = task.options!.find(value => value !== task.answer);
      else if (task.mode === 'multiple_choice') { const expected = task.answer as string[]; wrong = expected.length === task.options!.length ? expected.slice(1) : [task.options!.find(value => !expected.includes(value))]; }
      else if (task.mode === 'multi_blank') wrong = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: 'QA未达标' }));
      else if (task.mode === 'matching') { const pairs = (task.answer as { pairs: Array<{ left: string; right: string }> }).pairs;
        wrong = { pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + 1) % pairs.length].right })) }; }
      else throw new Error(`Uncovered mode ${task.mode}`); expect(gradeResponse(schema, task.answer, wrong).score, task.stem).toBe(0);
    }
  });
  it('enumerates every nonempty multiple-choice subset, with reversed correct order', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multiple_choice')) {
      const schema = schemaFor(family.atomId, task), expected = new Set(task.answer as string[]);
      for (let mask = 1; mask < 2 ** task.options!.length; mask++) { const answer = task.options!.filter((_, i) => mask & (1 << i));
        const correct = answer.length === expected.size && answer.every(value => expected.has(value)); expect(gradeResponse(schema, task.answer, answer).score).toBe(correct ? 1 : 0); }
      expect(gradeResponse(schema, task.answer, [...expected].reverse()).score).toBe(1);
    }
  });
  it('preserves partial credit for every intermediate multi-blank error', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const schema = schemaFor(family.atomId, task), expected = task.answer as Array<{ key: string; value: string }>;
      for (let index = 0; index < expected.length; index++) { const submitted = expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }));
        const result = gradeResponse(schema, task.answer, submitted); expect(result.score).toBeCloseTo((expected.length - 1) / expected.length); expect(result.scoreDetails).toHaveLength(expected.length); }
    }
  });
  it('rejects every non-identity matching permutation', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'matching')) {
      const schema = schemaFor(family.atomId, task), pairs = (task.answer as { pairs: Array<{ left: string; right: string }> }).pairs;
      expect(gradeResponse(schema, task.answer, { pairs: [...pairs].reverse() }).score).toBe(1);
      for (let shift = 1; shift < pairs.length; shift++) expect(gradeResponse(schema, task.answer, {
        pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + shift) % pairs.length].right })) }).score).toBe(0);
    }
  });
  it('assembles one four-structure example per written point within 600 seconds', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom;
      const candidates = families.filter(row => row.atomId === atomId).flatMap(row => row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`,
        atomId, family: row.family, dimension: row.dimension, questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1,
        probeRole: 'anchor', mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4); expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600);
      expect(atom.subject).toBe('chinese'); expect(atom.grade).toBe(1);
    }
  });
});
