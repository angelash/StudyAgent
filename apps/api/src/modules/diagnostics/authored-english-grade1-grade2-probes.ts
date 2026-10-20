import type { MeasurementDimension, QuestionBlock } from '@study-agent/contracts';
import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension'>;
type Item = { situation: string; answer: string; correctSentence: string; wrongSentence: string; wrong: string; wrong2: string; rule: string };
const names = ['Nora', 'Leo', 'Mia', 'Ben', 'Lily', 'Tom', 'Amy', 'Sam', 'Lucy', 'Mike', 'Eva', 'Max'];
const rotate = <T,>(values: readonly T[], n: number) => [...values.slice(n % values.length), ...values.slice(0, n % values.length)];
const table = (headers: string[], rows: string[][]): QuestionBlock => ({ id: 'record', type: 'table', headers, rows });
const choice = (stem: string, answer: string, options: readonly string[], analysis: string, blocks?: QuestionBlock[]): Task => ({ stem, answer,
  options: rotate([...new Set([answer, ...options])], stem.length), mode: 'single_choice', analysis, ...(blocks ? { blocks } : {}) });
const blanks = (stem: string, values: Array<[string, string, string]>, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem,
  answer: values.map(([key, , value]) => ({ key, value })), mode: 'multi_blank', responseShape: { entries: values.map(([key, label]) => ({ key, label })) }, analysis,
  ...(blocks ? { blocks } : {}) });
const sentenceRubric = [{ criterion: '包含材料要求的主语、动词或名词形式', weight: 0.4 }, { criterion: '句子完整通顺且语序符合当前规则', weight: 0.3 },
  { criterion: '句意与材料一致，允许合理同义表达', weight: 0.3 }];
const sentenceTask = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem, answer, mode: 'short_answer', rubric: sentenceRubric, analysis,
  ...(blocks ? { blocks } : {}) });
const oralRubric = [{ criterion: '完成题目要求的交际内容并能听懂', weight: 0.4 }, { criterion: '语言形式与句间组织足以表达意思', weight: 0.3 },
  { criterion: '关键内容可听清；允许自然停顿、自我修正且不因口音差异扣分', weight: 0.3 }];
const audio = (stem: string, answer: string, analysis: string, blocks?: QuestionBlock[]): Task => ({ stem: `${stem} 请录音回答，可先试听，最长3分钟。`, answer,
  mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric: oralRubric, analysis, ...(blocks ? { blocks } : {}) });

const wordBank = [
  ['apple', '苹果', 'banana', 'book'], ['book', '书', 'pen', 'apple'], ['cat', '猫', 'dog', 'bird'], ['dog', '狗', 'cat', 'fish'],
  ['red', '红色', 'blue', 'green'], ['blue', '蓝色', 'red', 'yellow'], ['green', '绿色', 'blue', 'black'], ['pencil', '铅笔', 'book', 'bag'],
  ['bag', '书包', 'cup', 'cat'], ['cup', '杯子', 'bag', 'pen'], ['bird', '鸟', 'fish', 'dog'], ['fish', '鱼', 'bird', 'cat'],
] as const;
const wordItems: Item[] = wordBank.map(([word, meaning, wrong, wrong2]) => ({ situation: `中文意义是“${meaning}”的英语词`, answer: word,
  correctSentence: `${meaning} is “${word}”.`, wrongSentence: `${meaning} is “${wrong}”.`, wrong, wrong2, rule: '词形必须与明确中文意义对应，不能按字母长度猜。' }));

const locations = [
  ['in the library', '图书馆', '操场', '教室'], ['on the playground', '操场', '图书馆', '花园'], ['in the classroom', '教室', '门厅', '厨房'],
  ['in the garden', '花园', '实验室', '阅览室'], ['in the reading room', '阅览室', '操场', '礼堂'], ['in the hall', '礼堂', '花园', '教室'],
  ['at the gate', '校门口', '图书馆', '厨房'], ['in the lab', '实验室', '花园', '礼堂'], ['at the front desk', '前台', '操场', '阅览室'],
  ['in the music room', '音乐室', '教室', '花园'], ['at the bus stop', '公交站', '图书馆', '门厅'], ['in the dining room', '餐厅', '礼堂', '校门口'],
] as const;
const locationItems: Item[] = locations.map(([phrase, place, wrong, wrong2]) => ({ situation: `${names[locations.findIndex(row => row[0] === phrase) % 12]} is ${phrase}. Where is the person?`, answer: place,
  correctSentence: `${names[locations.findIndex(row => row[0] === phrase) % 12]} is ${phrase}.`, wrongSentence: `${names[locations.findIndex(row => row[0] === phrase) % 12]} is in a different place.`, wrong, wrong2,
  rule: '地点由短材料中的明确英语地点短语决定。' }));

const addGenericFamilies = (families: AuthoredProbeFamily[], atomId: string, prefix: string, behavior: string, items: readonly Item[],
  finalProduction?: { stem: string; answer: (item: Item, n: number) => string; rule: string }) => {
  const itemAt = (n: number) => items[n % items.length];
  const makeStem = (n: number, text: string) => `${names[n]}'s ${prefix.replaceAll('-', ' ')} practice: ${text}`;
  families.push({ atomId, family: `${prefix}-form-choice`, dimension: 'understanding', behavior, structure: '明确规则/材料 → 选择正确表达',
    distinction: '核对词形、词序或意义，而不是按熟悉单词猜。', exercises: Array.from({ length: 12 }, (_, n) => { const item = itemAt(n); return { ...choice(
      makeStem(n, `${item.situation}. Which form is correct?`), item.answer, [item.wrong, item.wrong2], item.rule), family: `${prefix}-form-choice`, dimension: 'understanding', identityVersion: 2, expectedSeconds: 55 }; }) });
  families.push({ atomId, family: `${prefix}-produce`, dimension: 'procedure', behavior, structure: '明确情景 → 在单空产出正确形式',
    distinction: '需要自己产出完整词形，不从现成选项中识别。', exercises: Array.from({ length: 12 }, (_, n) => { const item = itemAt(n); return { ...blanks(
      makeStem(n, `Complete the response: ${item.situation}.`), [['answer', 'correct form', item.answer]], item.rule), family: `${prefix}-produce`, dimension: 'procedure', identityVersion: 2, expectedSeconds: 80 }; }) });
  families.push({ atomId, family: `${prefix}-record-repair`, dimension: 'transfer', behavior, structure: '三条情景/已有形式记录 → 定位唯一错误并修正',
    distinction: '需要逐行定位冲突后再产出，不是直接问一个孤立空位。', exercises: Array.from({ length: 12 }, (_, n) => { const selected = [0, 3, 6].map(i => itemAt(n + i)), broken = n % 3;
      const rows = selected.map((item, i) => [String(i + 1), item.situation, i === broken ? item.wrong : item.answer]);
      return { ...blanks(makeStem(n, 'Only one existing form conflicts with its situation. Fill the row and the correct form.'),
        [['row', 'wrong row', String(broken + 1)], ['answer', 'correct form', selected[broken].answer]], 'Compare each situation with its own form; the other two rows remain valid.',
        [table(['row', 'situation', 'existing form'], rows)]), family: `${prefix}-record-repair`, dimension: 'transfer', identityVersion: 2, expectedSeconds: 105 }; }) });
  families.push({ atomId, family: `${prefix}-context-application`, dimension: 'transfer', behavior, structure: '新的短材料/更新记录 → 应用当前规则',
    distinction: finalProduction ? '从材料组织完整目标句，不接受逐字模板匹配。' : '换入新材料后仍需按同一词形或关系规则作答。', exercises: Array.from({ length: 12 }, (_, n) => {
      const item = itemAt(n), current = `${item.correctSentence} ${finalProduction?.rule ?? 'The current material keeps the stated rule.'}`;
      if (finalProduction) return { ...sentenceTask(makeStem(n, finalProduction.stem), finalProduction.answer(item, n), `${finalProduction.rule} Reference: ${item.correctSentence}`,
        [table(['material', 'key words'], [['current situation', item.situation], ['required relation', item.rule]])]), family: `${prefix}-context-application`, dimension: 'transfer', identityVersion: 2, expectedSeconds: 120 };
      return { ...choice(makeStem(n, `${current} Which response follows the material?`), item.correctSentence, [item.wrongSentence, 'The material gives no usable evidence.'], item.rule),
        family: `${prefix}-context-application`, dimension: 'transfer', identityVersion: 2, expectedSeconds: 95 };
    }) });
};

const iamItems: Item[] = [
  ['Nora', 'a pupil'], ['Leo', 'ready'], ['Mia', 'happy'], ['Ben', 'nine'], ['Lily', 'at home'], ['Tom', 'hungry'],
  ['Amy', 'a reader'], ['Sam', 'here'], ['Lucy', 'a helper'], ['Mike', 'tired'], ['Eva', 'a writer'], ['Max', 'at school'],
].map(([name, complement]) => ({ situation: `The speaker is ${name}; complete “I ___ ${complement}.”`, answer: 'am',
  correctSentence: `I am ${name}.`, wrongSentence: `I is ${name}.`, wrong: 'is', wrong2: 'are', rule: 'The first-person singular subject I uses am.' }));
const pronounItems: Item[] = [
  ['Nora', 'girl', 'she'], ['Leo', 'boy', 'he'], ['Mia', 'girl', 'she'], ['Ben', 'boy', 'he'], ['Lily', 'girl', 'she'], ['Tom', 'boy', 'he'],
  ['Amy', 'girl', 'she'], ['Sam', 'boy', 'he'], ['Lucy', 'girl', 'she'], ['Mike', 'boy', 'he'], ['Eva', 'girl', 'she'], ['Max', 'boy', 'he'],
].map(([name, gender, pronoun]) => ({ situation: `The material says ${name} is a ${gender}. Replace ${name} with the correct subject pronoun.`, answer: pronoun,
  correctSentence: `${pronoun} is a ${gender}.`, wrongSentence: `${pronoun === 'he' ? 'she' : 'he'} is a ${gender}.`, wrong: pronoun === 'he' ? 'she' : 'he', wrong2: 'they',
  rule: 'She refers to a girl/woman and he refers to a boy/man when the material clearly identifies the person.' }));
const thisItems: Item[] = [
  ['book', 'a book'], ['pen', 'a pen'], ['bag', 'a bag'], ['cup', 'a cup'], ['map', 'a map'], ['shell', 'a shell'],
  ['chair', 'a chair'], ['model', 'a model'], ['card', 'a card'], ['box', 'a box'], ['picture', 'a picture'], ['ball', 'a ball'],
].map(([object, phrase]) => ({ situation: `One ${object} is near the speaker. Choose the sentence that introduces it.`, answer: 'This',
  correctSentence: `This is ${phrase}.`, wrongSentence: `These is ${phrase}.`, wrong: 'These', wrong2: 'Those', rule: 'Use this for one object near the speaker; these is plural and that/those point farther away.' }));

const introItems: Item[] = names.map((name, n) => ({ situation: `Introduce a fictional speaker named ${name}.`, answer: `I am ${name}.`,
  correctSentence: `I am ${name}.`, wrongSentence: `I is ${name}.`, wrong: 'I is.', wrong2: `${name} am I.`, rule: 'A simple self-introduction uses I am + name or role.' }));

const articleItems: Item[] = [
  ['apple', 'an', 'apple'], ['book', 'a', 'book'], ['orange', 'an', 'orange'], ['pen', 'a', 'pen'], ['egg', 'an', 'egg'], ['cat', 'a', 'cat'],
  ['umbrella', 'an', 'umbrella'], ['map', 'a', 'map'], ['insect', 'an', 'insect'], ['model', 'a', 'model'], ['hour', 'an', 'hour'], ['house', 'a', 'house'],
].map(([noun, article, word]) => ({ situation: `Choose a or an before the word “${noun}”.`, answer: article,
  correctSentence: `${article} ${word}`, wrongSentence: `${article === 'a' ? 'an' : 'a'} ${word}`, wrong: article === 'a' ? 'an' : 'a', wrong2: 'the one', rule: 'Use a/an according to the word’s initial sound; an precedes vowels and a precedes consonants. Special common case: an hour.' }));
const beItems = [
  ['I', 'am'], ['you', 'are'], ['we', 'are'], ['they', 'are'], ['he', 'is'], ['she', 'is'], ['Tom', 'is'], ['Nora', 'is'], ['the books', 'are'], ['the cat', 'is'], ['my friends', 'are'], ['the map', 'is'],
].map(([subject, be]) => ({ situation: `Complete “${subject} ___ ready.”`, answer: be,
  correctSentence: `${subject} ${be} ready.`, wrongSentence: `${subject} ${be === 'is' ? 'are' : be === 'are' ? 'is' : 'are'} ready.`, wrong: be === 'is' ? 'are' : 'is', wrong2: be === 'are' ? 'am' : 'are',
  rule: 'Match am with I, is with a singular third-person subject, and are with you/plural subjects.' }));
const demonstrativeItems = [
  ['one book near the speaker', 'This is a book.', 'These is a book.', 'This', 'These'], ['three books near the speaker', 'These are books.', 'This are books.', 'These', 'This'],
  ['one pen near you', 'That is a pen.', 'Those is a pen.', 'That', 'Those'], ['two pens over there', 'Those are pens.', 'That are pens.', 'Those', 'That'],
  ['one cup near me', 'This is a cup.', 'These is a cup.', 'This', 'These'], ['four cups over there', 'Those are cups.', 'That are cups.', 'Those', 'That'],
  ['two maps near you', 'These are maps.', 'This are maps.', 'These', 'This'], ['one map over there', 'That is a map.', 'Those is a map.', 'That', 'Those'],
  ['one bag near me', 'This is a bag.', 'These is a bag.', 'This', 'These'], ['three bags over there', 'Those are bags.', 'That are bags.', 'Those', 'That'],
  ['two shells near you', 'These are shells.', 'This are shells.', 'These', 'This'], ['one shell over there', 'That is a shell.', 'Those is a shell.', 'That', 'Those'],
].map(([situation, correct, incorrect, answer, wrong]) => ({ situation, answer, correctSentence: correct, wrongSentence: incorrect, wrong, wrong2: 'It',
  rule: 'This/that go with one object; these/those go with plural objects. Near/far must come from the material.' }));
const haveItems = [
  ['I', 'have'], ['you', 'have'], ['we', 'have'], ['they', 'have'], ['he', 'has'], ['she', 'has'], ['Tom', 'has'], ['Nora', 'has'], ['the pupils', 'have'], ['the model', 'has'], ['my friends', 'have'], ['the box', 'has'],
].map(([subject, verb]) => ({ situation: `Complete “${subject} ___ two cards.”`, answer: verb,
  correctSentence: `${subject} ${verb} two cards.`, wrongSentence: `${subject} ${verb === 'have' ? 'has' : 'have'} two cards.`, wrong: verb === 'have' ? 'has' : 'have', wrong2: 'is',
  rule: 'Use has with singular third-person subjects and have with I/you/we/they and plural subjects.' }));
const possessiveItems = [
  ['Nora (girl)', 'her map'], ['Leo (boy)', 'his map'], ['I', 'my map'], ['you', 'your map'], ['Mia (girl)', 'her card'], ['Ben (boy)', 'his card'],
  ['we', 'our card'], ['they', 'their card'], ['Lily (girl)', 'her book'], ['Tom (boy)', 'his book'], ['you and Leo', 'your book'], ['the pupils', 'their book'],
].map(([owner, phrase]) => ({ situation: `The material identifies the owner as ${owner}. Complete the phrase for a possession.`, answer: phrase.split(' ')[0],
  correctSentence: phrase, wrongSentence: `${phrase.split(' ')[0] === 'her' ? 'his' : 'her'} ${phrase.split(' ')[1]}`, wrong: phrase.startsWith('her') ? 'his' : 'her', wrong2: 'my',
  rule: 'Choose my/your/his/her/our/their from the owner, not from the possessed object.' }));
const canItems = [
  ['fly a kite', 'can fly'], ['draw a map', 'can draw'], ['read the book', 'can read'], ['swim in the pool', 'can swim'], ['make a model', 'can make'], ['open the box', 'can open'],
  ['write a card', 'can write'], ['sing a song', 'can sing'], ['find the key', 'can find'], ['carry the bag', 'can carry'], ['clean the desk', 'can clean'], ['fix the chair', 'can fix'],
].map(([action]) => ({ situation: `Complete the ability sentence “The pupil ___ ${action}.”`, answer: 'can',
  correctSentence: `The pupil can ${action}.`, wrongSentence: `The pupil cans ${action}.`, wrong: 'cans', wrong2: 'is can',
  rule: 'After can, use the base form of the verb; do not add -s or another be verb.' }));
const placeItems = [
  ['ball', 'in the box', 'on the box', 'under the box'], ['book', 'on the desk', 'under the desk', 'in the desk'], ['cat', 'under the chair', 'on the chair', 'in the chair'],
  ['cup', 'on the table', 'under the table', 'in the table'], ['map', 'in the bag', 'on the bag', 'under the bag'], ['pencil', 'on the book', 'under the book', 'in the book'],
  ['toy', 'under the bed', 'on the bed', 'in the bed'], ['card', 'in the box', 'under the box', 'on the box'], ['bag', 'on the hook', 'under the hook', 'in the hook'],
  ['shell', 'in the cup', 'on the cup', 'under the cup'], ['chair', 'under the window', 'in the window', 'on the window'], ['plate', 'on the shelf', 'under the shelf', 'in the shelf'],
].map(([object, correct, wrong, wrong2]) => ({ situation: `A diagram description states that the ${object} is ${correct}. Which phrase matches?`, answer: correct,
  correctSentence: `The ${object} is ${correct}.`, wrongSentence: `The ${object} is ${wrong}.`, wrong, wrong2, rule: 'Use in for enclosure, on for contact/support, and under for being below, based only on the material.' }));
const questionItems = [
  ['Who is fixing the model?', 'a person', 'who'], ['What is in the box?', 'an object', 'what'], ['Where is the map?', 'a place', 'where'], ['Who has the key?', 'a person', 'who'],
  ['What are you reading?', 'an object or content', 'what'], ['Where are the pupils?', 'a place', 'where'], ['Who is at the door?', 'a person', 'who'], ['What is on the desk?', 'an object', 'what'],
  ['Where is the bus stop?', 'a place', 'where'], ['Who is drawing?', 'a person', 'who'], ['What does Nora want?', 'an object or content', 'what'], ['Where is the reading room?', 'a place', 'where'],
].map(([question, type, answer]) => ({ situation: `The answer needed is ${type}. Choose the question word for “${question}”.`, answer,
  correctSentence: question, wrongSentence: question.replace(/^(Who|What|Where)/, answer === 'who' ? 'Where' : 'Who'), wrong: answer === 'who' ? 'where' : 'who', wrong2: 'how many',
  rule: 'Match who with people, what with objects/content, and where with places.' }));
const politeItems = [
  ['someone gives you a pencil', 'Thank you.'], ['you bump a classmate accidentally', 'I am sorry.'], ['you ask for a book', 'May I have the book, please?'], ['a friend helps carry a box', 'Thank you for your help.'],
  ['you arrive late to class', 'I am sorry I am late.'], ['you want a classmate to pass a pen', 'May I borrow your pen, please?'], ['you receive a card', 'Thank you for the card.'], ['you step on a paper by mistake', 'I am sorry.'],
  ['you need the teacher to repeat', 'Could you say that again, please?'], ['you leave the group early', 'Excuse me, may I leave now?'], ['your friend wishes you good luck', 'Thank you, and good luck to you too.'], ['you ask to open the window', 'May I open the window, please?'],
].map(([situation, answer]) => ({ situation: `In the situation “${situation}”, choose an appropriate polite response.`, answer,
  correctSentence: answer, wrongSentence: situation.includes('helps') || situation.includes('gives') || situation.includes('card') ? 'I am sorry.' : 'Thank you.',
  wrong: situation.includes('helps') || situation.includes('gives') || situation.includes('card') ? 'I am sorry.' : 'Thank you.', wrong2: 'Hello.',
  rule: 'Polite phrases serve specific purposes: thanks for help/gifts, sorry for mistakes, requests for permission or objects, and clarification when needed.' }));
const objectItems = [
  ['a red pencil on the desk', 'This is a red pencil. It is on the desk.'], ['a blue bag on the chair', 'This is a blue bag. It is on the chair.'], ['a green cup on the table', 'This is a green cup. It is on the table.'],
  ['a yellow book in the bag', 'This is a yellow book. It is in the bag.'], ['a small shell in the box', 'This is a small shell. It is in the box.'], ['a white card under the cup', 'This is a white card. It is under the cup.'],
  ['a red kite on the wall', 'This is a red kite. It is on the wall.'], ['a blue pen on the map', 'This is a blue pen. It is on the map.'], ['a green chair near the window', 'This is a green chair. It is near the window.'],
  ['a yellow map in the drawer', 'This is a yellow map. It is in the drawer.'], ['a small toy under the bed', 'This is a small toy. It is under the bed.'], ['a white plate on the shelf', 'This is a white plate. It is on the shelf.'],
].map(([situation, answer]) => ({ situation, answer, correctSentence: answer, wrongSentence: 'This is a thing. It is somewhere.', wrong: 'This is a thing.', wrong2: 'It is a color.',
  rule: 'Name the object first, then add the stated color/position with a correct noun phrase and be verb.' }));

export function buildEnglishGrade1Grade2ProbeFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  addGenericFamilies(families, 'foundation:english:g1-meaning', 'g1-word-meaning', '从明示中文意义识别基础英语词', wordItems);
  addGenericFamilies(families, 'foundation:english:g1-locate', 'g1-explicit-location', '从英语短材料定位人物地点', locationItems);
  addGenericFamilies(families, 'core:english:iam', 'iam-subject-form', '把I与am正确结合', iamItems);
  addGenericFamilies(families, 'core:english:he-she', 'he-she-reference', '根据人物线索选择he或she', pronounItems);
  addGenericFamilies(families, 'core:english:this', 'this-near-one', '用this介绍近处单个对象', thisItems);
  addGenericFamilies(families, 'core:english:introduce-self', 'self-introduction', '用I am介绍自己的姓名或角色', introItems,
    { stem: 'Using the named fictional speaker in the material, write one complete self-introduction.', answer: item => item.answer, rule: 'Use I + am + name/role in a complete sentence.' });

  addGenericFamilies(families, 'foundation:english:g2-meaning', 'g2-word-meaning', '从第二组明示意义识别英语词', wordItems.map((item, n) => ({ ...item,
    situation: `第二组词义练习 ${n + 1}: ${item.situation}`, correctSentence: `The stated meaning matches “${item.answer}”.` })));
  addGenericFamilies(families, 'foundation:english:g2-locate', 'g2-explicit-location', '从第二组英语短材料定位地点', locationItems.map((item, n) => ({ ...item,
    situation: `第二组定位材料 ${n + 1}: ${item.situation}` })));
  addGenericFamilies(families, 'core:english:article', 'article-a-an', '按单词首音选择a或an', articleItems);
  addGenericFamilies(families, 'core:english:be', 'be-subject-match', '按主语选择am/is/are', beItems);
  addGenericFamilies(families, 'core:english:demonstrative', 'demonstrative-near-far', '按近远和单复数选择指示词', demonstrativeItems);
  addGenericFamilies(families, 'core:english:have-has', 'have-has-subject', '按主语选择have或has', haveItems);
  addGenericFamilies(families, 'core:english:possessive', 'possessive-owner', '按拥有者选择所属词', possessiveItems);
  addGenericFamilies(families, 'core:english:can', 'can-base-verb', 'can后保持动词原形', canItems);
  addGenericFamilies(families, 'core:english:placeword', 'place-in-on-under', '按明确空间关系选择in/on/under', placeItems);
  addGenericFamilies(families, 'core:english:questionword', 'question-word-type', '按需要的信息类型选择问词', questionItems);
  addGenericFamilies(families, 'core:english:polite', 'polite-purpose', '按交际目的选择礼貌表达', politeItems);
  addGenericFamilies(families, 'core:english:object-description', 'object-two-sentences', '按材料用两句英语描述物品', objectItems,
    { stem: 'Using the object, color and position in the material, write two complete English sentences.', answer: item => item.answer, rule: 'Sentence one introduces this + noun; sentence two uses it + be + the stated color or position.' });

  const oral = (atomId: string, prefix: string, topic: string) => {
    const make = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string, seconds: number, makeTask: (n: number) => Task) =>
      families.push({ atomId, family, dimension, behavior, structure, distinction, exercises: Array.from({ length: 12 }, (_, n) => { const task = makeTask(n); return { ...task,
        stem: `${names[n]}'s ${topic}: ${task.stem}`, family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });
    make(`${prefix}-source-name`, 'procedure', '依据物卡完成问候并介绍姓名', '材料姓名+问候 → 完整录音', '姓名可虚构，关键交际内容与语言组织分别记录。', 105, n => audio(`Say a greeting and introduce the fictional name ${names[n]}.`, `Hello! My name is ${names[n]}.`, 'The rubric checks greeting, name introduction, complete sentence and audibility; it does not score accent.'));
    make(`${prefix}-source-greeting`, 'procedure', '按时段和人物完成问候', '明确时段/人物卡 → 问候录音', '时段信息必须来自词卡，不能另加未给出身份。', 105, n => {
      const time = ['morning', 'afternoon', 'evening'][n % 3], greeting = ['Good morning!', 'Good afternoon!', 'Good evening!'][n % 3];
      return audio(`It is ${time}. Greet a new classmate named ${names[n]}.`, `${greeting} My name is ${names[n]}.`, 'Use the stated time greeting and one understandable name sentence.',
        [table(['card', 'information'], [['time', time], ['person', names[n]]])]);
    });
    make(`${prefix}-personal`, 'transfer', '用真实或虚构信息完成自我介绍', '个人身份提纲 → 问候+姓名录音', '允许合理姓名和自然措辞，内容不逐字匹配。', 120, n => audio(`Introduce yourself to a new friend. You may use a fictional name and role.`, `Hello! My name is ${names[n]}. I am a pupil.`, 'The rubric checks greeting, self-introduction and understandable connected speech; it does not verify the real identity.'));
    make(`${prefix}-updated-role`, 'transfer', '按更新后的角色或时段调整问候', '旧资料与最新更新 → 当前问候录音', '旧姓名/时段必须排除，但仍允许合理寒暄。', 120, n => audio(`The old card said ${names[(n + 3) % 12]} at night. The latest card says ${names[n]} in the morning. Greet the person on the latest card.`, `Good morning! My name is ${names[n]}.`, 'Use the updated morning setting and updated name; do not keep the old information.', [table(['version', 'information'], [['old', `${names[(n + 3) % 12]} / night`], ['latest', `${names[n]} / morning`]])]));
  };
  oral('core:english:oral-greeting', 'oral-greeting', 'oral greeting and introduction');

  const objectOral = (family: string, dimension: MeasurementDimension, behavior: string, structure: string, distinction: string, seconds: number,
    make: (n: number) => Task) => families.push({ atomId: 'core:english:oral-object', family, dimension, behavior, structure, distinction,
    exercises: Array.from({ length: 12 }, (_, n) => { const task = make(n); return { ...task, stem: `${names[n]}'s oral object task: ${task.stem}`,
      family, dimension, identityVersion: 2, expectedSeconds: seconds }; }) });
  const oralObjects = [
    ['book', 'red', 'on the desk'], ['pencil', 'blue', 'in the bag'], ['cup', 'green', 'on the table'], ['bag', 'yellow', 'on the chair'],
    ['shell', 'white', 'in the box'], ['card', 'red', 'under the book'], ['map', 'blue', 'on the wall'], ['ball', 'green', 'under the bed'],
    ['kite', 'yellow', 'near the window'], ['plate', 'white', 'on the shelf'], ['model', 'red', 'on the box'], ['picture', 'blue', 'on the wall'],
  ] as const;
  objectOral('oral-object-source', 'procedure', '口头介绍材料中的物品、颜色和位置', '物卡三字段 → 两句完整英语录音', '必须先说名称，再补材料给出的特征。', 105, n => {
    const [object, color, position] = oralObjects[n]; return audio(`Describe the object from the material in two English sentences: a ${color} ${object} ${position}.`, `This is a ${color} ${object}. It is ${position}.`,
      'The rubric checks object, stated feature, two connected sentences and audibility.', [table(['field', 'information'], [['object', object], ['color', color], ['position', position]])]);
  });
  objectOral('oral-object-sequence', 'procedure', '按名称—特征顺序组织两条口头句子', '两个信息卡 → 连贯录音', '每句都要有主语和be，不能只说短语。', 115, n => {
    const [object, color, position] = oralObjects[(n + 3) % 12]; return audio('Use the two cards to say what the object is and where it is. Speak at least two complete sentences.', `This is a ${object}. It is ${position}; its color is ${color}.`,
      'The rubric checks complete sentence organization and all material features.', [table(['card', 'information'], [['object', `${color} ${object}`], ['position', position]])]);
  });
  objectOral('oral-object-personal', 'transfer', '口头描述身边可见物品', '个人观察提示 → 名称/颜色/位置录音', '允许真实自述，不能确认所描述物品实际存在。', 120, n => audio('Choose one nearby object. Say its name, one visible color or feature, and its position in at least two sentences.', `This is a ${oralObjects[n][0]}. It is ${oralObjects[n][2]} and it is ${oralObjects[n][1]}.`,
      'The rubric checks understandable object and feature description, not factual verification of the student’s surroundings.'));
  objectOral('oral-object-updated', 'transfer', '按更新后的物品特征重新描述', '旧物卡与最新更新 → 当前物体录音', '只保留最新对象、颜色和位置。', 120, n => {
    const old = oralObjects[(n + 5) % 12], latest = oralObjects[n]; return audio(`The old card showed a ${old[1]} ${old[0]} ${old[2]}. The latest card shows a ${latest[1]} ${latest[0]} ${latest[2]}. Describe only the latest card in two sentences.`, `This is a ${latest[1]} ${latest[0]}. It is ${latest[2]}.`,
      'The rubric checks that old object/features are excluded and the latest two-sentence description is complete.', [table(['version', 'object description'], [['old', `a ${old[1]} ${old[0]} ${old[2]}`], ['latest', `a ${latest[1]} ${latest[0]} ${latest[2]}`]])]);
  });
  return families;
}
