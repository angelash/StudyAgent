import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension' | 'identityVersion'>;
const atomId = 'source:chinese:g3:02915a7d:word-reading';
/** The word list is an editorial transcription; actual spoken pronunciation still needs review. */
export const firstSourceReadingWords = [
  { character: '坝', word: '坪坝', pinyin: 'bà' }, { character: '汉', word: '汉字', pinyin: 'hàn' },
  { character: '艳', word: '鲜艳', pinyin: 'yàn' }, { character: '扮', word: '打扮', pinyin: 'bàn' },
  { character: '扬', word: '飘扬', pinyin: 'yáng' }, { character: '读', word: '朗读', pinyin: 'dú' },
  { character: '摔', word: '摔倒', pinyin: 'shuāi' }, { character: '跤', word: '摔跤', pinyin: 'jiāo' },
  { character: '凤', word: '凤尾竹', pinyin: 'fèng' }, { character: '洁', word: '洁白', pinyin: 'jié' },
] as const;
const rubric = [
  { criterion: '按本题指定的新字词逐项识读，字音和声调依据实际录音复核，不用选择题成绩代替发音', weight: 0.5 },
  { criterion: '把目标字放回词语或当前语句，词语意义与语境相容，要求比较时能说明区别', weight: 0.3 },
  { criterion: '录音可辨认，允许自然停顿与自我修正，不因口音差异一概扣分；听不清保留待复核', weight: 0.2 },
];
const oral = (stem: string, answer: string, analysis: string): Task => ({ stem: stem + ' 请用自己的声音录音回答，可先试听，最长3分钟。',
  answer, mode: 'audio_record', responseShape: { mediaPolicy: 'student-media-v1' }, rubric, expectedSeconds: 120, analysis,
});

/** Independent editorial stock, never a claim that a generated voice or a media identifier is a learner response. */
export function buildFirstSourceReadingFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (family: string, dimension: Exercise['dimension'], behavior: string, structure: string, distinction: string, tasks: Task[]) =>
    families.push({ atomId, family, dimension, behavior, structure, distinction,
      exercises: tasks.map(task => ({ ...task, family, dimension, identityVersion: 2 })) });

  add('reading-character-tone-pair', 'understanding', '区分指定字的拼音与声调，书面辨认和实际发音分别记录',
    '两个明确词语中的指定字＋备选拼音 → 分别填写拼音',
    '此结构只检查书面字音对应，不能因为两空全对就推断已能实际读出；原音频表现另用产生性任务复核。',
    Array.from({ length: 5 }, (_, index) => {
      const [left, right] = firstSourceReadingWords.slice(index * 2, index * 2 + 2), alternatives = [...new Set([left.pinyin, right.pinyin, 'bá', 'jiè'])];
      return { stem: `从备选“${alternatives.join('、')}”中，分别填写“${left.word}”里的“${left.character}”和“${right.word}”里的“${right.character}”的读音。只核查书面辨认，实际发音还需录音。`,
        mode: 'multi_blank', answer: [{ key: 'left', value: left.pinyin }, { key: 'right', value: right.pinyin }],
        responseShape: { entries: [{ key: 'left', label: left.character + '的读音' }, { key: 'right', label: right.character + '的读音' }] },
        expectedSeconds: 80, analysis: `${left.word}中的${left.character}读${left.pinyin}，${right.word}中的${right.character}读${right.pinyin}。按当前词语和声调核对，书面辨认不代替真实朗读。` };
    }));
  add('reading-unmarked-word-production', 'procedure', '不依靠现成拼音实际读出指定字词',
    '不标拼音的明确词语清单 → 原音频逐词识读＋任选一词说明意思',
    '不是填写拼音或播放参考音频；必须保留本人实际读音与自我修正，参考答案只供有权限的复核者使用。', [
      oral('请依次读“坪坝、汉字、鲜艳”，再选一个词，用自己的话说明意思。', '坪坝中的坝读bà，汉字中的汉读hàn，鲜艳中的艳读yàn；词义解释应与平地、汉字或色彩明亮相容。', '听原录音逐字复核，不把键盘写出的拼音或他人声音当本人读音。'),
      oral('请依次读“打扮、飘扬、朗读”，再选一个词说明它可以用在什么场景。', '扮bàn、扬yáng、读dú；所说场景须符合装扮、随风摆动或出声读文字等意义。', '实际发音与词义分别记录，允许先读错后自己更正，保留更正经过。'),
      oral('请依次读“摔倒、摔跤、凤尾竹”，再说说前两个词中共同的那个字怎样读。', '摔shuāi、跤jiāo、凤fèng；摔倒和摔跤中的共同字是摔。', '读完整词语再比较共同字；没有录音时保持未测，不能直接采用文字参考判分。'),
      oral('请按这一新顺序读“洁白、朗读、打扮、坪坝”，任选一个词说一句自己的话。', '洁jié、读dú、扮bàn、坝bà；自编句子应清楚且词义相容。', '改变顺序仍在同一词表识读结构内，不增加题族；句子不要求照参考措辞。'),
      oral('请按这一新顺序读“鲜艳、凤尾竹、汉字、飘扬、摔跤”，遇到不会的词可以明确说暂时不会。', '艳yàn、凤fèng、汉hàn、扬yáng、摔shuāi、跤jiāo；逐词核对，未知项如实保留。', '不会读不应被空白或播放合成读法伪装成已会，保留本人原始响应。'),
    ]);
  add('reading-fresh-sentence-production', 'transfer', '将目标字词放入新语句，保持词义与读音对应',
    '自编新语句中的目标字词 → 朗读完整句子并说明当前意思',
    '相较孤立词表，需在句中确定断句与当前意思，不能仅背一串拼音或从旧示范复制整段录音。', [
      oral('原创句子：“广场上的彩旗在风中飘扬，墙边新画的花朵色彩鲜艳。”请朗读，再说明两个目标词各描写什么。',
        '飘扬的扬yáng，鲜艳的艳yàn；前者描述彩旗随风摆动，后者描述色彩明亮。', '读音与修饰对象要同时复核，不把形容颜色的词解释成旗帜动作。'),
      oral('原创句子：“雨后，值日小组把走廊打扫洁净；午间，小宁在窗边朗读自己写的短文。”请朗读，并解释两个活动是否发生在同一明确时段。',
        '洁jié、读dú；材料分别标雨后和午间，不能据此断言两个活动同时进行。', '新词洁净仍核对洁字的读音与清洁意义；时段判断接受保留未知的解释。'),
    ]);
  add('reading-annotated-error-self-correction', 'transfer', '核查现成注音、指出不相符项并亲自读出修正',
    '明确词语＋含错误的注音记录 → 定位错误、录下正确读法与核对过程',
    '不只从备选中选拼音，也不盲从旁人的现成注音；在纠错条件下保留本人实际读法，不以文字改注代替录音。', [
      oral('有人给“汉字、打扮、洁白”中的指定字注为“汉hàn、扮bàn、洁jiè”。这份记录有一处声调不合。请指出并亲自读出这三个词。',
        '洁白的洁应读jié，不是jiè；汉hàn、扮bàn。', '错误标注属于题目材料，修正不能只抄答案；原录音仍等待量规复核。'),
      oral('有人把“摔跤、凤尾竹、飘扬”中的指定字记为“跤jiǎo、凤fèng、扬yáng”。请核对不合适的标注，再实际读出三个词。',
        '摔跤中的跤应读jiāo，不是jiǎo；凤fèng、扬yáng。', '指定词语限定读音，重点看实际读音和自我核对，不能把错误标注当提示后的自动掌握。'),
    ]);
  add('reading-visual-word-contrast', 'retention', '在形近或同音词对中辨认指定词，再清楚读出完整词语',
    '新语境＋两组易混词形 → 根据对象选词并录下两词的读法或差别',
    '不是重新读一张孤立词表；还需依据字形与词义辨认材料所指对象，遇到同音不凭读音假装已经区分字形。', [
      oral('原创记录：“同学把自己写的一段话读出声音。”请在“朗读/郎读”中指出规范词形，再读完整词语，说明你怎样核对“朗”。',
        '应选朗读；读dú。两个相近字形不能仅靠声音决定正字，应依据规范词语和字形核对。', '错误词形仅供辨析，读对音不等于已经写对字；字形选择与实际读音分开复核。'),
      oral('原创记录：“旗子随着风展开、摆动。”请比较“飘扬/飘杨”，选出这里的规范词语并读出，说明这里为什么不是树木名称。',
        '应选飘扬，扬yáng；句子描写旗帜随风摆动，不是杨树。', '扬和杨同音，必须说清词义与字形条件，不能靠合成音频替自己选择字形。'),
      oral('原创记录：“小路刚被打扫过，没有垃圾和污迹。”请比较“洁净/结净”，说出这里的规范词语，再读完整词语。',
        '应选洁净，洁jié；描述清洁状态，不使用结净。', '同音并不保证字形正确，保存原口头比较和实际读法。'),
      oral('原创记录：“摔倒后，小宁站稳了。”请在“摔倒/衰倒”中选择符合动作意义的词语，再清楚读出，说明目标字的声调。',
        '应选摔倒，摔shuāi；句子说失去平衡倒下的动作，摔是第一声。', '字音、字形、动作意义都要核对，听不清的声调保留待复核。'),
    ]);
  add('reading-context-cloze-production', 'retention', '在新语境中选择相容词义，再把完整语句独立读出',
    '有语义限制的新句＋多个候选词 → 补足词语、朗读整句并说明选择依据',
    '材料没有直接给出完整句子，需先根据语境选词再完成实际朗读；不能仅提交词语选项就算已经识读。', [
      oral('原创句子：“表演前，大家整理服装，把自己认真地（打扮/摔跤）了一番。”请选合适的词，读出完整句子，再说明理由。',
        '选打扮，扮bàn；整理服装和表演准备限定为装扮，不是摔跤动作。', '先核对语义选择，再听整句里的实际发音；选择正确仍不自动取得朗读分。'),
      oral('原创句子：“新做的花环颜色明亮，显得十分（鲜艳/朗读）。”请选词并朗读，说明它描写的是什么。',
        '选鲜艳，艳yàn；它描写花环颜色明亮，朗读是读文字的活动。', '形容颜色与活动词不同，语义与实际字音分别复核。'),
      oral('原创句子：“山间的一块平地上，孩子们沿着小路走过（坪坝/凤尾竹）。”请根据句意选词，读出整句，并解释所选词所指的地点。',
        '选坪坝，坝bà；句意描述山间平地，不是植物凤尾竹。', '本题词义受明确句意限制，不直接把坝解释为所有语境下的水坝。'),
      oral('原创句子：“展台上放着两片（洁白/飘扬）的纸，准备给同学写观察记录。”请选词后完整朗读，再指出词语在这里说明哪种特点。',
        '选洁白，洁jié；它说明纸洁净而白，材料没有把纸写成随风飘动。', '纸也可能被风吹起，但本句没有这个条件，不能脱离语境任意选择；实际朗读待复核。'),
    ]);
  return families;
}
