import type { AuthoredProbeFamily } from './authored-math-probes';
import type { Exercise } from './foundation-curriculum';

type Task = Omit<Exercise, 'family' | 'dimension' | 'identityVersion'>;
const atomId = 'source:chinese:g3:02915a7d:handwriting';
export const firstSourceWritingCharacters = ['晨', '绒', '球', '汉', '艳', '服', '装', '扮', '静', '停', '孔', '雀', '粗'] as const;
const rubric = [
  { criterion: '实际手写原件包含本题要求的各目标字；逐字核对完整字形与部件，没有用打字、印刷图或他人书写代替', weight: 0.5 },
  { criterion: '部件与位置符合已核对范字；按任务说明保留初写、自查或修正痕迹，不由一张静态图推断笔顺或运笔', weight: 0.3 },
  { criterion: '图片清楚且能区分各字与标记，缺少目标字或模糊处保留待补证，不凭图片上传成功判书写达标', weight: 0.2 },
];
const writing = (stem: string, answer: string, analysis: string): Task => ({ stem: stem + ' 请上传自己的手写原件图片，保留初写与需要说明的标记。',
  answer, mode: 'image_upload', responseShape: { mediaPolicy: 'student-media-v1' }, rubric, expectedSeconds: 150, analysis });
const copyFamily = 'writing-observe-produce-check', repairFamily = 'writing-component-repair', recallFamily = 'writing-cued-word-production';

/** Four task structures, not six: transfer and delayed variants keep the SAME repair/recall identities.
 * These candidates do not supply a stroke-order standard or automatically publish a definition.
 */
export function buildFirstSourceWritingFamilies(): AuthoredProbeFamily[] {
  const families: AuthoredProbeFamily[] = [];
  const add = (family: string, dimension: Exercise['dimension'], behavior: string, structure: string, distinction: string, tasks: Task[]) =>
    families.push({ atomId, family, dimension, behavior, structure, distinction,
      exercises: tasks.map(task => ({ ...task, family, dimension, identityVersion: 2 })) });
  const groups = [['晨', '绒', '球'], ['汉', '艳', '服'], ['装', '扮', '静'], ['停', '孔'], ['雀', '粗']];
  add('writing-layout-recognition', 'understanding', '辨认目标字部件排列，把辨认与亲自书写分开',
    '指定目标字的印刷字形 → 分别填写左右或上下结构',
    '只核对部件位置，不证明已经会写；印刷字形不能提供动态笔顺或替代实际手写原件。', groups.map(chars => ({
      stem: `观察“${chars.join('、')}”的部件排列，分别从“左右、上下”中填写结构。这一题只检查字形辨认，另有亲自手写任务。`,
      mode: 'multi_blank', answer: chars.map((char, index) => ({ key: 'c' + index, value: ['晨', '装', '雀'].includes(char) ? '上下' : '左右' })),
      responseShape: { entries: chars.map((char, index) => ({ key: 'c' + index, label: char + '的结构' })) }, expectedSeconds: 80,
      analysis: chars.map(char => `${char}按${['晨', '装', '雀'].includes(char) ? '上下' : '左右'}观察部件位置`).join('；') + '。实际字形与书写仍由原图片和量规复核，不由结构答案推定。',
    })));
  const orders = [
    [...firstSourceWritingCharacters],
    ['绒', '球', '晨', '服', '装', '汉', '艳', '扮', '孔', '雀', '粗', '静', '停'],
    ['装', '晨', '雀', '绒', '球', '汉', '艳', '服', '扮', '静', '停', '孔', '粗'],
    ['静', '停', '孔', '雀', '粗', '晨', '汉', '服', '装', '扮', '艳', '绒', '球'],
    ['服', '装', '扮', '绒', '球', '汉', '艳', '静', '停', '孔', '雀', '粗', '晨'],
  ];
  add(copyFamily, 'procedure', '逐字观察、亲自写出全部13字，再保留自查依据',
    '13字目标清单 → 每字一次真实手写＋部件位置自查',
    '每道候选都包含完整13字，不拿抽中少量字当全部书写；五个排列变式始终只是同一个观察书写结构。', orders.map((chars, index) => writing(
      `请按清单亲自各写一次：“${chars.join('、')}”。写后${['在三个需要仔细核对的部件旁作小标记', '给上下结构的字加一个外侧小记号', '给左右结构的字加一个外侧小记号', '选一个想再核对的字，在旁边重写一次', '选两个自己觉得最需要比较部件位置的字，在旁边作记号'][index]}，不要擦掉初写。`,
      '原件应逐字包含晨、绒、球、汉、艳、服、装、扮、静、停、孔、雀、粗。实际字形由有权限的复核者参照已确认范字逐项核对，不能以印刷图片或结构题代替。',
      '清单文字只供目标与部件位置观察，不作为动态笔顺标准；自查标记与原手写都要保留，静态图不足以判断运笔顺序。')));
  add(repairFamily, 'transfer', '根据明确错因说明，亲自修正字形并保留核对部位',
    '部件错配记录 → 定位错误部位＋手写正确目标字＋标记依据',
    '不是只选择一种结构，也不是照抄全部清单；要把错误记录具体落实到部件及位置，修正与初始依据都保留。', [
      writing('一份自编核对记录把“绒”的右部说成“戒”，把“球”的右部说成“术”。请亲自写出这两个目标字，分别在对应的右部旁作标记，并写一句核对说明。',
        '绒的右部应按戎核对，球的右部应按求核对；图片必须有本人写出的绒和球及标记。', '错误部件描述只供比较，不应教成正确范字；实际完整字形及标记需人工复核。'),
      writing('一份自编记录把“装”写成下部壮、上部衣，把“静”说成左争右青。请按目标字的正确部件位置亲自写出两字，并在图上标出你修正的位置。',
        '装按上壮下衣观察，静按左青右争观察；保留本人手写与位置标记。', '只改说明文字不能证明实际写对；两字按完整字形和部件位置复核，不推断静态图未显示的笔顺。'),
    ]);
  add(recallFamily, 'transfer', '从拼音与词义提示写出目标字，保留实际字形',
    '拼音和意义提示、不直接给目标字形 → 手写指定词或字',
    '提示给的是声音编码与意思，需生成字形，不是从字表照写；迁移与保持沿用同一结构身份，不改维度制造新题族。', [
      writing('根据拼音与意思写出目标词：zhuāng bàn，意思是修饰自己、改变外表；再根据“cū，与细相对”写出一个目标字。题目不给这三个目标字的字形。',
        '应有本人手写的装、扮、粗，词语为装扮；按实际字形核对，不以拼音抄写代替。', '这是拼音/词义提示书写，并非实际听写音频；音、义提示与字形产生的条件须如实保留。'),
      writing('根据提示亲自写字：kǒng què，一种有长尾羽的鸟；jìng，指不喧闹的那个本课目标字。不要用打字或只写拼音代替。',
        '应有本人写出的孔、雀、静；没有给出动态笔顺，不凭想象补教学步骤。', '原图中每字分别复核，少一个目标字就保留缺项，不能因附件完整而默认全会写。'),
    ]);
  add(repairFamily, 'retention', '在到期新材料里重做部件纠错，不把当天修正当保持',
    '新的部件错配说明 → 亲自写出目标字并标出修正位置',
    '与迁移的部件纠错是同一结构，保留相同题族名；四道新材料不增加四个独立题族，也不代表经过真实间隔。', [
      writing('新核对记录把“绒”右部漏看一笔，把“球”右部看成“术”。请分别亲自写出两字，在右部旁作标记，说明实际应核对的完整部件。',
        '绒右部按戎整体核对，球右部按求整体核对；实际笔画是否完整由原图逐字复核。', '不得因错因文字已明确就自动判手写正确，图片与量规仍必需。'),
      writing('新记录把“汉”的左右部件位置互换，又把“艳”的左右部件位置互换。请亲自写出两字，标出各字的左部和右部。',
        '汉为左氵右又；艳为左丰右色，原图需完整包含两字与相应标记。', '部件名称可用指向标记说明，难读部件不应直接变成书写错误；实际位置必须可辨。'),
      writing('新记录把“装”的上、下部件混在一起，并把“静”的右部误看成“青”。请亲自写出两字，标出你需要核对的上下或左右关系。',
        '装上壮下衣，静左青右争；核对整个字形，不只读出部件名称。', '相同纠错结构沿用原题族，只有实际到期、原答和复核条件满足后才谈保持结果。'),
      writing('新记录给“停”左边加了多余部件，又把“孔”的右边看成完整的“乙”。请亲自写两字，标记停的左部和孔的右边，保留原件。',
        '停左边按亻核对；孔右边核对竖弯钩形态，不能当成完整乙字；其他部分也需完整复核。', '只说明局部不足以证明整个字已会写，实际原图仍须按目标字整体检查。'),
    ]);
  add(recallFamily, 'retention', '到期后依据新的拼音词义组合生成字形',
    '新的拼音/词义组合 → 独立手写指定目标字',
    '沿用迁移的提示书写身份，四组合共同覆盖13字；单次部分字表现不外推为其余字已会，真实原图和间隔另核对。', [
      writing('新提示：zǎo chén，指一天中较早的时段，只写第二个目标字；fú zhuāng，指穿在身上的衣物，写两个目标字。',
        '本题目标为晨、服、装，需本人手写原件逐字复核。', '没有直接给出目标字形；不能只凭上传成功、拼音或他人代写判断。'),
      writing('新提示：róng qiú，细软丝绒团成的小圆团，写两个目标字；cū，与细相对，写这个目标字。',
        '本题目标为绒、球、粗，需实际字形与部件位置分别复核。', '保持材料使用新组合，结构身份不变；不得把本题三个字的表现外推为13字全部达标。'),
      writing('新提示：kǒng què，一种有长尾羽的鸟，写两个目标字；ān jìng，指不喧闹，只写第二个目标字。',
        '本题目标为孔、雀、静，图片需清楚区分三个字和必要的自查标记。', '同音或拼音写对不能替代字形；看不清、缺字或需要复核处如实保留。'),
      writing('新提示：tíng zhǐ，指不再向前或不再继续，只写第一个目标字；dǎ bàn，指修饰自己，只写第二个目标字；hàn zì，按这个常用词的拼音只写第一个目标字；xiān yàn，形容色彩明丽，只写第二个目标字。',
        '本题目标为停、扮、汉、艳，逐字复核；四组保持提示合计覆盖晨绒球汉艳服装扮静停孔雀粗。', '本题仍是拼音/词义提示书写，不伪装成没有音频的听写。真实间隔和本人原件须由原复测流程证明。'),
    ]);
  return families;
}
