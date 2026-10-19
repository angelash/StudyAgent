import { createHash } from 'node:crypto';
import { KnowledgeAtom, MeasurementDimension, QuestionAnswerMode, QuestionBlock, Subject } from '@study-agent/contracts';
import { buildCoreCurriculum } from './original-core-curriculum';
import { addStructuredExercises } from './structured-curriculum';

export type Exercise = { stem: string; answer: unknown; dimension: MeasurementDimension; family: string; mode?: QuestionAnswerMode; options?: string[];
  responseShape?: Record<string, unknown>; blocks?: QuestionBlock[];
  rubric?: Array<{ criterion: string; weight: number }> };
export type FoundationDefinition = { atom: KnowledgeAtom; exercises: Exercise[] };
type Template = (index: number) => Exercise;
const exercise = (stem: string, answer: string | number, family: string, dimension: MeasurementDimension = 'procedure', mode?: QuestionAnswerMode): Exercise => ({ stem, answer, family, dimension, mode });

/** Original rule-checkable foundation exercises. This is an initial curriculum, never a claim of full textbook coverage or calibrated norms. */
export function buildFoundationCurriculum(): FoundationDefinition[] {
  const result: FoundationDefinition[] = [];
  const add = (subject: Subject, grade: number, code: string, name: string, objective: string, prerequisiteIds: string[], template: Template, count = 24) => {
    const id = `foundation:${subject}:${code}`;
    const atom: KnowledgeAtom = { id, subject, grade, name, strand: subject === 'math' ? '数、关系与表示' : subject === 'chinese' ? '语言与阅读' : '语言形式与意义',
      term: 'both', objective, successCriterion: `在明确条件下独立完成“${name}”，能说明所用关系或步骤`,
      prerequisiteIds: prerequisiteIds.map((code) => `foundation:${subject}:${code}`), curriculumVersion: 'foundation-v1', status: 'published', version: 1 };
    const unique = new Map<string, Exercise>();
    for (let index = 0; index < count; index++) {
      const item = template(index);
      unique.set(`${item.stem}\u0000${item.answer}`, item);
    }
    result.push({ atom, exercises: [...unique.values()] });
  };

  add('math', 1, 'decompose10', '10以内的数分解', '把一个整体分成两个部分，确定缺少的部分', [], (n) => {
    const total = 3 + n % 8, part = 1 + Math.floor(n / 3) % (total - 1);
    return n % 2 ? exercise(`一共有 ${total} 个积木，红色有 ${part} 个，其余是蓝色。蓝色有几个？`, total - part, 'part-whole-context', 'transfer') :
      exercise(`把 ${total} 分成 ${part} 和几？`, total - part, 'part-whole-symbol', 'understanding');
  }, 48);
  add('math', 1, 'add20', '20以内加法合并', '将两个部分合并，确定总数', ['decompose10'], (n) => {
    const a = 2 + n % 8, b = 1 + Math.floor(n / 3) % 9;
    return n % 3 === 0 ? exercise(`小禾有 ${a} 张卡片，又收到 ${b} 张。现在有几张？`, a + b, 'addition-story', 'transfer') :
      n % 3 === 1 ? exercise(`${a} + ${b} = ?`, a + b, 'addition-symbol') : exercise(`两个部分分别是 ${a} 和 ${b}，整体是多少？`, a + b, 'addition-part-whole', 'understanding');
  }, 48);
  add('math', 1, 'subtract20', '20以内减法求剩余', '从总数中去掉一部分，求剩余数量', ['decompose10'], (n) => {
    const a = 10 + n % 10, b = 1 + Math.floor(n / 2) % 9;
    return n % 2 ? exercise(`有 ${a} 支铅笔，送出 ${b} 支，还剩几支？`, a - b, 'subtraction-remain-story', 'transfer') : exercise(`${a} - ${b} = ?`, a - b, 'subtraction-symbol');
  }, 48);
  add('math', 2, 'placevalue', '十进制位值换算', '说明十位和个位表示的数量，并进行换算', ['decompose10'], (n) => {
    const tens = 1 + n % 9, units = Math.floor(n / 3) % 10;
    return n % 2 ? exercise(`${tens * 10 + units} 里面有几个十？`, tens, 'placevalue-read', 'understanding') : exercise(`${tens} 个十和 ${units} 个一合起来是多少？`, tens * 10 + units, 'placevalue-compose', 'understanding');
  }, 48);
  add('math', 2, 'borrowdecision', '判断个位是否需要退位', '比较被减数与减数个位，判断是否需要向十位退位', ['placevalue', 'subtract20'], (n) => {
    const a = 40 + n % 40, b = 10 + (n * 7) % 20;
    return exercise(`计算 ${a} - ${b} 时，个位是否需要向十位退位？（填“需要”或“不需要”）`, a % 10 < b % 10 ? '需要' : '不需要', n % 2 ? 'borrow-decision-compare' : 'borrow-decision-symbol', 'understanding', 'text_blank');
  }, 48);
  add('math', 2, 'borrowexchange', '退一作十的换算', '十位退去1后，给个位补上10个一', ['placevalue', 'borrowdecision'], (n) => {
    const units = n % 8, tens = 2 + Math.floor(n / 4) % 7;
    return n % 2 ? exercise(`${tens} 个十和 ${units} 个一，拿出1个十换成10个一后，一共有几个一？（只数个位这部分）`, units + 10, 'borrow-exchange-representation', 'understanding') :
      exercise(`计算 ${tens * 10 + units} - ${units + 2}，个位不够减。十位退1后，个位应按几来减？`, units + 10, 'borrow-exchange-step');
  }, 48);
  add('math', 2, 'multiplytable', '乘法等组关系', '根据相同组数与每组数量确定总量', ['add20'], (n) => {
    const a = 2 + n % 8, b = 2 + Math.floor(n / 3) % 8;
    return n % 3 === 0 ? exercise(`有 ${a} 盒笔，每盒 ${b} 支，一共有多少支？`, a * b, 'equal-groups-story', 'transfer') : n % 3 === 1 ?
      exercise(`${a} × ${b} = ?`, a * b, 'multiplication-symbol') : exercise(`${a} 个 ${b} 相加是多少？`, a * b, 'repeated-addition', 'understanding');
  }, 48);
  add('math', 2, 'divisiontable', '平均分与除法', '将整体平均分成若干份，求每份数量', ['multiplytable'], (n) => {
    const groups = 2 + n % 8, each = 2 + Math.floor(n / 4) % 8;
    return n % 2 ? exercise(`把 ${groups * each} 个橘子平均分给 ${groups} 人，每人几个？`, each, 'division-sharing-story', 'transfer') : exercise(`${groups * each} ÷ ${groups} = ?`, each, 'division-symbol');
  }, 48);
  add('math', 3, 'multiplydigits', '多位数乘一位数', '按数位分解并合并部分积', ['placevalue', 'multiplytable'], (n) => {
    const a = 12 + n * 2, b = 2 + n % 7;
    return n % 2 ? exercise(`每袋有 ${a} 颗种子，${b} 袋共有多少颗？`, a * b, 'multiply-digits-story', 'transfer') : exercise(`${a} × ${b} = ?`, a * b, 'multiply-digits-symbol');
  });
  add('math', 3, 'divisiondigits', '多位数除以一位数', '按位分配，确定没有余数时的商', ['divisiontable', 'placevalue'], (n) => {
    const quotient = 11 + n, divisor = 2 + n % 7;
    return n % 2 ? exercise(`${quotient * divisor} 本书平均放在 ${divisor} 层书架上，每层几本？`, quotient, 'division-digits-story', 'transfer') : exercise(`${quotient * divisor} ÷ ${divisor} = ?`, quotient, 'division-digits-symbol');
  });
  add('math', 3, 'perimeter', '长方形周长的边界关系', '将长方形四条边相加，区别周长与面积', ['multiplytable', 'add20'], (n) => {
    const length = 5 + n, width = 2 + n % 5;
    return n % 2 ? exercise(`长方形花圃长 ${length} 米、宽 ${width} 米，围一圈需多长的围栏？`, (length + width) * 2, 'perimeter-context', 'transfer') :
      exercise(`长方形的长是 ${length} 厘米，宽是 ${width} 厘米。周长是多少厘米？`, (length + width) * 2, 'perimeter-formula');
  });
  add('math', 4, 'multiplytwo', '两位数乘两位数', '将乘数分解成十位和个位分别求积再合并', ['multiplydigits'], (n) => {
    const a = 12 + n, b = 11 + n % 13;
    return n % 2 ? exercise(`每排 ${a} 个座位，共 ${b} 排，一共有多少座位？`, a * b, 'multiply-two-context', 'transfer') : exercise(`${a} × ${b} = ?`, a * b, 'multiply-two-symbol');
  });
  add('math', 4, 'remainder', '余数与除数的约束', '将不能整分的数量分组，确定余数且检验余数小于除数', ['divisiondigits'], (n) => {
    const d = 3 + n % 6, q = 4 + n % 9, r = 1 + n % (d - 1);
    return n % 2 ? exercise(`${q * d + r} 个球，每袋装 ${d} 个，装满若干袋后剩几个？`, r, 'remainder-context', 'transfer') : exercise(`${q * d + r} ÷ ${d} 的余数是多少？`, r, 'remainder-symbol');
  });
  add('math', 4, 'rectanglearea', '长方形面积的覆盖关系', '用长乘宽确定单位正方形的数量', ['multiplytwo', 'perimeter'], (n) => {
    const length = 8 + n, width = 3 + n % 8;
    return n % 2 ? exercise(`长 ${length} 米、宽 ${width} 米的长方形地面，面积是多少平方米？`, length * width, 'area-covering-context', 'transfer') :
      exercise(`长方形长 ${length} 厘米、宽 ${width} 厘米，面积是多少平方厘米？`, length * width, 'area-direct');
  });
  add('math', 5, 'decimalplace', '小数数位与位值', '把十分位和百分位的数量表示为小数', ['placevalue'], (n) => {
    const integer = 1 + n % 6, tenths = 1 + n % 9, hundredths = 1 + Math.floor(n / 3) % 9;
    return n % 2 ? exercise(`${integer}.${tenths}${hundredths} 的百分位数字是多少？`, hundredths, 'decimal-place-read', 'understanding') :
      exercise(`${integer} 个一、${tenths} 个十分之一、${hundredths} 个百分之一合起来是多少？`, (integer * 100 + tenths * 10 + hundredths) / 100, 'decimal-place-compose', 'understanding');
  });
  add('math', 5, 'decimaladd', '小数加法数位对齐', '按相同数位对齐再合并各位数量', ['decimalplace', 'add20'], (n) => {
    const a = 115 + n * 13, b = 70 + n * 7;
    return n % 2 ? exercise(`买本子花 ${(a / 100).toFixed(2)} 元，买笔花 ${(b / 100).toFixed(2)} 元，共花多少元？`, (a + b) / 100, 'decimal-add-context', 'transfer') :
      exercise(`${(a / 100).toFixed(2)} + ${(b / 100).toFixed(2)} = ?`, (a + b) / 100, 'decimal-add-symbol');
  });
  add('math', 5, 'fractionequivalence', '分数等值变换', '同时扩大分子和分母相同倍数，保持分数大小', ['multiplytable', 'divisiontable'], (n) => {
    const numerator = 1 + n % 7, denominator = numerator + 2 + n % 5, factor = 2 + n % 6;
    return n % 2 ? exercise(`${numerator}/${denominator} 的分母扩大为 ${denominator * factor}，分子应是多少？`, numerator * factor, 'equivalent-fraction-context', 'understanding') :
      exercise(`补全等式：${numerator}/${denominator} = ?/${denominator * factor}。填写分子。`, numerator * factor, 'equivalent-fraction-symbol');
  });
  add('math', 6, 'fractionmultiply', '分数乘法与约分', '将分子分母分别相乘，并用等值分数表示结果', ['fractionequivalence'], (n) => {
    const a = 1 + n % 5, b = a + 2, c = 1 + Math.floor(n / 3) % 6, d = c + 3;
    return n % 2 ? exercise(`一段绳子长 ${a}/${b} 米，用去其中的 ${c}/${d}，用去多少米？（填分数或小数）`, `${a * c}/${b * d}`, 'fraction-product-context', 'transfer') :
      exercise(`${a}/${b} × ${c}/${d} = ?（填分数或小数）`, `${a * c}/${b * d}`, 'fraction-product-symbol');
  });
  add('math', 6, 'percentage', '百分率与部分整体', '把百分率表示为每一百份中的部分，并计算对应数量', ['fractionequivalence', 'decimalplace'], (n) => {
    const total = 100 + n * 20, percent = 5 + n % 16 * 5;
    return n % 2 ? exercise(`一批有 ${total} 本书，其中 ${percent}% 是故事书。故事书有多少本？`, total * percent / 100, 'percent-part-context', 'transfer') :
      exercise(`${total} 的 ${percent}% 是多少？`, total * percent / 100, 'percent-part-direct');
  });
  add('math', 6, 'ratio', '按比分配的份数关系', '先确定总份数，再求各部分数量', ['divisiontable', 'multiplydigits'], (n) => {
    const a = 1 + n % 5, b = 2 + n % 7, each = 3 + n;
    return n % 2 ? exercise(`红、蓝珠子数量比为 ${a}:${b}，共 ${(a + b) * each} 颗。红珠子几颗？`, a * each, 'ratio-context', 'transfer') :
      exercise(`把 ${(a + b) * each} 按 ${a}:${b} 分成两份，第一份是多少？`, a * each, 'ratio-direct');
  });

  const names = ['小禾', '小林', '小雨', '明明', '小安', '小宁', '小乐', '小文'];
  const places = ['图书馆', '教室', '公园', '操场', '书房', '花园', '礼堂', '阅览室'];
  for (let grade = 1; grade <= 6; grade++) {
    const prior = grade > 1 ? [`g${grade - 1}-locate`] : [];
    add('chinese', grade, `g${grade}-locate`, `显式信息定位（${grade}年级材料）`, '从文本中找到问题要求的地点信息，并排除无关地点', prior, (n) => {
      const name = names[n % names.length], place = places[Math.floor(n / 3) % places.length], other = places[(Math.floor(n / 3) + 3) % places.length];
      const variants = [ `${name}在${place}读书。${name}在哪里读书？`, `在${place}，${name}找到一本书。书是在哪里找到的？`,
        `${name}先经过${other}，随后来到${place}看书。${name}最后在哪里看书？`, `${other}今天没有开放。${name}决定去${place}借书。借书的地点是哪里？` ];
      return { ...exercise(variants[n % 4], place, `locate-structure-${n % 4}`, n % 4 >= 2 ? 'transfer' : 'understanding', 'single_choice'),
        options: [place, other, places[(Math.floor(n / 3) + 5) % places.length]] };
    }, 32);
    const causes = [['下雨了', '带上雨伞'], ['天气变冷', '穿上外套'], ['想了解星空', '查阅天文书'], ['地面很滑', '放慢脚步'], ['口渴了', '喝了一杯水'], ['要保护花草', '沿着小路行走']];
    add('chinese', grade, `g${grade}-cause`, `因果关系识别（${grade}年级材料）`, '在明确的因果句中区分原因和结果', [`g${grade}-locate`], (n) => {
      const name = names[n % names.length], [cause, effect] = causes[Math.floor(n / 4) % causes.length];
      const sentences = [`因为${cause}，${name}${effect}。`, `${name}之所以${effect}，是因为${cause}。`, `${cause}，所以${name}${effect}。`, `${name}${effect}，原因是${cause}。`];
      return { ...exercise(`${sentences[n % 4]}哪一项说明了原因？`, cause, `cause-syntax-${n % 4}`, 'understanding', 'single_choice'),
        options: [effect, cause, '文中没有说明原因'] };
    });
  }

  const vocabulary: Array<Array<[string, string]>> = [
    [['red', '红色'], ['blue', '蓝色'], ['green', '绿色'], ['one', '一'], ['two', '二'], ['three', '三'], ['cat', '猫'], ['dog', '狗']],
    [['book', '书'], ['pen', '钢笔'], ['pencil', '铅笔'], ['desk', '课桌'], ['chair', '椅子'], ['school', '学校'], ['teacher', '教师'], ['student', '学生']],
    [['father', '父亲'], ['mother', '母亲'], ['sister', '姐妹'], ['brother', '兄弟'], ['apple', '苹果'], ['banana', '香蕉'], ['orange', '橙子'], ['grape', '葡萄']],
    [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['bread', '面包'], ['rice', '米饭'], ['milk', '牛奶'], ['water', '水'], ['juice', '果汁']],
    [['library', '图书馆'], ['hospital', '医院'], ['museum', '博物馆'], ['cinema', '电影院'], ['station', '车站'], ['river', '河流'], ['mountain', '山'], ['village', '村庄']],
    [['yesterday', '昨天'], ['tomorrow', '明天'], ['spring', '春天'], ['summer', '夏天'], ['autumn', '秋天'], ['winter', '冬天'], ['left', '左边'], ['right', '右边']],
  ];
  for (let grade = 1; grade <= 6; grade++) {
    add('english', grade, `g${grade}-meaning`, `词形与词义联结（基础组${grade}）`, '根据已学习的英语词形识别对应的中文意义', grade > 1 ? [`g${grade - 1}-meaning`] : [], (n) => {
      const [word, meaning] = vocabulary[grade - 1][n % 8];
      return Math.floor(n / 8) % 2 ? exercise(`请写出“${meaning}”对应的英语单词。`, word, 'word-production', 'procedure', 'text_blank') :
        { ...exercise(`英语单词“${word}”的中文意思是什么？`, meaning, 'word-recognition', 'understanding', 'single_choice'),
          options: [meaning, vocabulary[grade - 1][(n + 1) % 8][1], vocabulary[grade - 1][(n + 3) % 8][1]] };
    }, 16);
    const locations = ['library', 'school', 'park', 'museum', 'cinema', 'hospital', 'station', 'classroom'];
    const englishNames = ['Amy', 'Ben', 'Lily', 'Tom', 'Lucy', 'Sam', 'Alice', 'Mike'];
    add('english', grade, `g${grade}-locate`, `英语显式信息定位（基础组${grade}）`, '从短句中找到人物所在地点并用原文词语回答', [`g${grade}-meaning`], (n) => {
      const name = englishNames[n % 8], place = locations[Math.floor(n / 3) % 8], other = locations[(Math.floor(n / 3) + 3) % 8];
      const sentences = [`${name} is at the ${place}. Where is ${name}?`, `At the ${place}, ${name} reads a book. Where does ${name} read?`,
        `${name} goes past the ${other} and stops at the ${place}. Where does ${name} stop?`, `The ${other} is closed. ${name} waits at the ${place}. Where does ${name} wait?`];
      return exercise(`${sentences[n % 4]}（只填写地点单词）`, place, `english-location-${n % 4}`, n % 4 >= 2 ? 'transfer' : 'understanding', 'text_blank');
    }, 32);
  }
  return addStructuredExercises([...result, ...buildCoreCurriculum()]);
}

export function foundationQuestionId(atomId: string, item: Exercise) {
  const content = typeof item.answer === 'object' ? JSON.stringify([item.answer, item.mode, item.responseShape]) : String(item.answer);
  return `foundation_q_${createHash('sha256').update(`${atomId}:${item.stem}:${content}`).digest('hex').slice(0, 24)}`;
}
