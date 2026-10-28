import type { Subject, TextbookVolume } from '@study-agent/contracts';

export type CurriculumScaffoldLesson = {
  title: string;
  knowledgePoints: string[];
};

export type CurriculumScaffoldUnit = {
  title: string;
  lessons: CurriculumScaffoldLesson[];
};

export type CurriculumScaffold = {
  units: CurriculumScaffoldUnit[];
};

type GradeBand = 'lower' | 'middle' | 'upper';

type KnowledgePointCandidate = {
  id: string;
  name: string;
};

type KnowledgePointRule = {
  keywords: Array<RegExp | string>;
  targetIncludes: string[];
};

const subjectFallbackScaffold: Record<Subject, CurriculumScaffold> = {
  chemistry: { units: [] },
  chinese: {
    units: [
      {
        title: '基础积累',
        lessons: [
          {
            title: '字词句训练',
            knowledgePoints: ['字词积累', '句子表达'],
          },
        ],
      },
      {
        title: '阅读与表达',
        lessons: [
          {
            title: '阅读与综合',
            knowledgePoints: ['阅读理解', '综合表达'],
          },
        ],
      },
    ],
  },
  math: {
    units: [
      {
        title: '数与运算',
        lessons: [
          {
            title: '基础计算',
            knowledgePoints: ['数的认识', '基础运算'],
          },
        ],
      },
      {
        title: '综合应用',
        lessons: [
          {
            title: '应用与测量',
            knowledgePoints: ['长度与测量', '综合应用'],
          },
        ],
      },
    ],
  },
  english: {
    units: [
      {
        title: '语言基础',
        lessons: [
          {
            title: '词汇与句型',
            knowledgePoints: ['基础词汇', '基础句型'],
          },
        ],
      },
      {
        title: '综合运用',
        lessons: [
          {
            title: '阅读与表达',
            knowledgePoints: ['阅读理解', '写作表达'],
          },
        ],
      },
    ],
  },
};

const curriculumScaffolds: Partial<Record<Subject, Record<`${GradeBand}:${TextbookVolume['term']}`, CurriculumScaffold>>> = {
  chinese: {
    'lower:first': {
      units: [
        {
          title: '识字与朗读',
          lessons: [
            {
              title: '拼音与识字',
              knowledgePoints: ['拼音认读', '识字写字'],
            },
            {
              title: '朗读与积累',
              knowledgePoints: ['朗读训练', '词语积累'],
            },
          ],
        },
        {
          title: '表达启蒙',
          lessons: [
            {
              title: '看图说话',
              knowledgePoints: ['观察表达', '句子表达'],
            },
            {
              title: '阅读入门',
              knowledgePoints: ['阅读理解', '综合表达'],
            },
          ],
        },
      ],
    },
    'lower:second': {
      units: [
        {
          title: '字词基础',
          lessons: [
            {
              title: '识字写字',
              knowledgePoints: ['识字写字', '偏旁部首'],
            },
            {
              title: '词句训练',
              knowledgePoints: ['词语运用', '句子表达'],
            },
          ],
        },
        {
          title: '阅读与交流',
          lessons: [
            {
              title: '朗读与理解',
              knowledgePoints: ['朗读训练', '阅读理解'],
            },
            {
              title: '口语与表达',
              knowledgePoints: ['口语交际', '综合表达'],
            },
          ],
        },
      ],
    },
    'middle:first': {
      units: [
        {
          title: '字词句段',
          lessons: [
            {
              title: '字词与句子',
              knowledgePoints: ['字词积累', '句段理解'],
            },
            {
              title: '古诗文积累',
              knowledgePoints: ['古诗积累', '传统文化积累'],
            },
          ],
        },
        {
          title: '阅读与习作',
          lessons: [
            {
              title: '阅读理解',
              knowledgePoints: ['阅读理解', '概括与提炼'],
            },
            {
              title: '习作表达',
              knowledgePoints: ['习作表达', '综合表达'],
            },
          ],
        },
      ],
    },
    'middle:second': {
      units: [
        {
          title: '阅读方法',
          lessons: [
            {
              title: '段落与结构',
              knowledgePoints: ['段落结构', '阅读理解'],
            },
            {
              title: '古诗文阅读',
              knowledgePoints: ['古诗积累', '文言启蒙'],
            },
          ],
        },
        {
          title: '表达训练',
          lessons: [
            {
              title: '观察与习作',
              knowledgePoints: ['观察表达', '习作表达'],
            },
            {
              title: '综合实践',
              knowledgePoints: ['口语交际', '综合表达'],
            },
          ],
        },
      ],
    },
    'upper:first': {
      units: [
        {
          title: '语言积累',
          lessons: [
            {
              title: '字词与语法',
              knowledgePoints: ['字词积累', '基础语法'],
            },
            {
              title: '古诗文阅读',
              knowledgePoints: ['古诗积累', '文言文阅读'],
            },
          ],
        },
        {
          title: '阅读与写作',
          lessons: [
            {
              title: '综合阅读',
              knowledgePoints: ['阅读理解', '概括与提炼'],
            },
            {
              title: '写作表达',
              knowledgePoints: ['习作表达', '写作修改'],
            },
          ],
        },
      ],
    },
    'upper:second': {
      units: [
        {
          title: '阅读深化',
          lessons: [
            {
              title: '综合阅读',
              knowledgePoints: ['阅读理解', '文学鉴赏'],
            },
            {
              title: '文言与古诗',
              knowledgePoints: ['文言文阅读', '古诗积累'],
            },
          ],
        },
        {
          title: '表达综合',
          lessons: [
            {
              title: '写作表达',
              knowledgePoints: ['习作表达', '写作修改'],
            },
            {
              title: '语文实践',
              knowledgePoints: ['口语交际', '综合表达'],
            },
          ],
        },
      ],
    },
  },
  math: {
    'lower:first': {
      units: [
        {
          title: '数与计算',
          lessons: [
            {
              title: '数的认识',
              knowledgePoints: ['10 以内数的认识', '20 以内数的认识'],
            },
            {
              title: '基础加减法',
              knowledgePoints: ['20 以内加法', '20 以内减法'],
            },
          ],
        },
        {
          title: '图形与生活',
          lessons: [
            {
              title: '图形初步认识',
              knowledgePoints: ['图形初步认识', '位置与方向'],
            },
            {
              title: '生活中的数学',
              knowledgePoints: ['看图列式', '解决实际问题'],
            },
          ],
        },
      ],
    },
    'lower:second': {
      units: [
        {
          title: '数与运算',
          lessons: [
            {
              title: '百以内数',
              knowledgePoints: ['100 以内数的认识', '整十数计算'],
            },
            {
              title: '进位与退位',
              knowledgePoints: ['进位加法', '退位减法'],
            },
          ],
        },
        {
          title: '测量与统计',
          lessons: [
            {
              title: '长度与人民币',
              knowledgePoints: ['长度与测量', '人民币认识'],
            },
            {
              title: '统计与应用',
              knowledgePoints: ['简单统计', '综合应用'],
            },
          ],
        },
      ],
    },
    'middle:first': {
      units: [
        {
          title: '数与运算',
          lessons: [
            {
              title: '万以内的数',
              knowledgePoints: ['万以内数的认识', '数位与大小规律'],
            },
            {
              title: '加减乘法',
              knowledgePoints: ['两三位数加减法', '多位数乘一位数'],
            },
          ],
        },
        {
          title: '测量与应用',
          lessons: [
            {
              title: '长度与时间',
              knowledgePoints: ['长度与测量', '时间认识'],
            },
            {
              title: '倍与解决问题',
              knowledgePoints: ['倍的认识', '解决实际问题'],
            },
          ],
        },
      ],
    },
    'middle:second': {
      units: [
        {
          title: '除法与分数',
          lessons: [
            {
              title: '除法基础',
              knowledgePoints: ['有余数除法', '除法应用'],
            },
            {
              title: '分数初步认识',
              knowledgePoints: ['分数初步认识', '分数比较'],
            },
          ],
        },
        {
          title: '图形与统计',
          lessons: [
            {
              title: '面积与周长',
              knowledgePoints: ['周长与面积', '图形与几何'],
            },
            {
              title: '统计与综合',
              knowledgePoints: ['简单统计', '综合应用'],
            },
          ],
        },
      ],
    },
    'upper:first': {
      units: [
        {
          title: '数与代数',
          lessons: [
            {
              title: '小数与分数',
              knowledgePoints: ['小数基础', '分数基础'],
            },
            {
              title: '方程与运算',
              knowledgePoints: ['方程初步', '多位数乘除法'],
            },
          ],
        },
        {
          title: '图形与统计',
          lessons: [
            {
              title: '图形与测量',
              knowledgePoints: ['图形与几何', '长度与测量'],
            },
            {
              title: '统计与应用',
              knowledgePoints: ['统计与可能性', '综合应用'],
            },
          ],
        },
      ],
    },
    'upper:second': {
      units: [
        {
          title: '数与比例',
          lessons: [
            {
              title: '分数与百分数',
              knowledgePoints: ['分数运算', '百分数与比例'],
            },
            {
              title: '数量关系',
              knowledgePoints: ['方程与数量关系', '解决实际问题'],
            },
          ],
        },
        {
          title: '图形与数据',
          lessons: [
            {
              title: '圆与立体',
              knowledgePoints: ['圆与立体图形', '图形与几何'],
            },
            {
              title: '统计分析',
              knowledgePoints: ['统计与数据分析', '综合应用'],
            },
          ],
        },
      ],
    },
  },
  english: {
    'lower:first': {
      units: [
        {
          title: '语言启蒙',
          lessons: [
            {
              title: '字母与发音',
              knowledgePoints: ['字母识读', '基础拼读'],
            },
            {
              title: '课堂表达',
              knowledgePoints: ['课堂指令', '基础口语'],
            },
          ],
        },
        {
          title: '词汇与句型',
          lessons: [
            {
              title: '基础词汇',
              knowledgePoints: ['基础词汇', '日常表达'],
            },
            {
              title: '简单句型',
              knowledgePoints: ['基础句型', '情景对话'],
            },
          ],
        },
      ],
    },
    'lower:second': {
      units: [
        {
          title: '语音与词汇',
          lessons: [
            {
              title: '字母与单词',
              knowledgePoints: ['字母识读', '单词拼写'],
            },
            {
              title: '词汇归类',
              knowledgePoints: ['基础词汇', '词汇归类'],
            },
          ],
        },
        {
          title: '句型与表达',
          lessons: [
            {
              title: '基础句型',
              knowledgePoints: ['基础句型', '句型转换'],
            },
            {
              title: '听说表达',
              knowledgePoints: ['情景对话', '口语表达'],
            },
          ],
        },
      ],
    },
    'middle:first': {
      units: [
        {
          title: '词汇与句型',
          lessons: [
            {
              title: '单词与拼写',
              knowledgePoints: ['单词拼写', '基础词汇'],
            },
            {
              title: '句型训练',
              knowledgePoints: ['基础句型', '句型转换'],
            },
          ],
        },
        {
          title: '综合运用',
          lessons: [
            {
              title: '对话交际',
              knowledgePoints: ['情景对话', '口语表达'],
            },
            {
              title: '阅读入门',
              knowledgePoints: ['阅读理解', '综合表达'],
            },
          ],
        },
      ],
    },
    'middle:second': {
      units: [
        {
          title: '语言积累',
          lessons: [
            {
              title: '词汇与句型',
              knowledgePoints: ['词汇归类', '基础句型'],
            },
            {
              title: '语法基础',
              knowledgePoints: ['基础语法', '句型转换'],
            },
          ],
        },
        {
          title: '阅读与表达',
          lessons: [
            {
              title: '阅读理解',
              knowledgePoints: ['阅读理解', '情景对话'],
            },
            {
              title: '写作表达',
              knowledgePoints: ['写作表达', '口语表达'],
            },
          ],
        },
      ],
    },
    'upper:first': {
      units: [
        {
          title: '词汇与语法',
          lessons: [
            {
              title: '词汇短语',
              knowledgePoints: ['重点词汇与短语', '单词拼写'],
            },
            {
              title: '句型语法',
              knowledgePoints: ['基础语法', '时态与句型'],
            },
          ],
        },
        {
          title: '阅读与写作',
          lessons: [
            {
              title: '阅读理解',
              knowledgePoints: ['阅读理解', '综合表达'],
            },
            {
              title: '写作表达',
              knowledgePoints: ['写作表达', '口语表达'],
            },
          ],
        },
      ],
    },
    'upper:second': {
      units: [
        {
          title: '语法综合',
          lessons: [
            {
              title: '句型与语法',
              knowledgePoints: ['语法综合', '时态与句型'],
            },
            {
              title: '主题词汇',
              knowledgePoints: ['重点词汇与短语', '词汇归类'],
            },
          ],
        },
        {
          title: '阅读表达',
          lessons: [
            {
              title: '主题阅读',
              knowledgePoints: ['阅读理解', '情景对话'],
            },
            {
              title: '写作与表达',
              knowledgePoints: ['写作表达', '口语表达'],
            },
          ],
        },
      ],
    },
  },
};

const knowledgePointRules: Record<Subject, KnowledgePointRule[]> = {
  chemistry: [],
  chinese: [
    { keywords: ['诗', '古诗', '下一句', '名句'], targetIncludes: ['古诗', '文言'] },
    { keywords: ['阅读', '短文', '文章', '比喻', '理解', '概括', '说明'], targetIncludes: ['阅读', '概括'] },
    { keywords: ['词语', '近义词', '反义词', '填空', '字词'], targetIncludes: ['词', '字词'] },
    { keywords: ['句子', '表达', '习作', '写作', '说话'], targetIncludes: ['表达', '习作', '写作', '口语'] },
  ],
  math: [
    { keywords: [/÷/u, '除', '平均分'], targetIncludes: ['除法'] },
    { keywords: [/×/u, '乘', '相乘', '口诀'], targetIncludes: ['乘法'] },
    { keywords: ['偶数', '奇数', '数位', '认识数', '比较大小'], targetIncludes: ['数的认识', '数位'] },
    { keywords: ['厘米', '米', '千米', '毫米', '分米', '长度', '课桌', '铅笔', '筷子', '灯管', '篮球场'], targetIncludes: ['测量', '长度'] },
    { keywords: ['面积', '周长', '图形', '圆', '立体'], targetIncludes: ['图形', '面积', '周长', '几何', '圆'] },
    { keywords: ['统计', '平均', '可能性', '数据'], targetIncludes: ['统计', '数据'] },
    { keywords: ['分数', '百分数', '比例'], targetIncludes: ['分数', '百分数', '比例'] },
    { keywords: ['方程', '等式', '未知数'], targetIncludes: ['方程'] },
    { keywords: ['共有', '一共', '多少枚', '应用题', '还剩', '解决'], targetIncludes: ['应用', '解决实际问题', '加减'] },
  ],
  english: [
    { keywords: ['letter', '字母', 'phonics'], targetIncludes: ['字母', '拼读'] },
    { keywords: ['spell', '拼写', 'word', '单词'], targetIncludes: ['词汇', '拼写'] },
    { keywords: ['this is', 'what', 'who', 'where', 'how many', '句型'], targetIncludes: ['句型', '语法', '时态'] },
    { keywords: ['dialogue', '对话', 'listen', 'speak'], targetIncludes: ['对话', '口语'] },
    { keywords: ['read', '阅读', 'passage'], targetIncludes: ['阅读'] },
    { keywords: ['write', '写作', '作文'], targetIncludes: ['写作', '表达'] },
  ],
};

function resolveGradeBand(grade: number): GradeBand {
  if (grade <= 2) {
    return 'lower';
  }
  if (grade <= 4) {
    return 'middle';
  }
  return 'upper';
}

export function getCurriculumScaffold(subject: Subject, grade: number, term: TextbookVolume['term']): CurriculumScaffold {
  const gradeBand = resolveGradeBand(grade);
  return curriculumScaffolds[subject]?.[`${gradeBand}:${term}`] ?? subjectFallbackScaffold[subject];
}

export function pickBestKnowledgePointId(
  subject: Subject,
  questionText: string,
  knowledgePoints: KnowledgePointCandidate[],
) {
  if (knowledgePoints.length === 0) {
    return null;
  }

  const normalizedText = questionText.trim().toLowerCase();
  let bestKnowledgePointId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const knowledgePoint of knowledgePoints) {
    const normalizedName = knowledgePoint.name.toLowerCase();
    let score = 0;

    if (normalizedText.includes(normalizedName)) {
      score += 6;
    }

    if (normalizedName.includes('综合') || normalizedName.includes('应用')) {
      score += 1;
    }

    for (const rule of knowledgePointRules[subject]) {
      const hasKeywordMatch = rule.keywords.some((keyword) =>
        keyword instanceof RegExp ? keyword.test(questionText) : normalizedText.includes(keyword.toLowerCase()),
      );
      if (!hasKeywordMatch) {
        continue;
      }

      if (rule.targetIncludes.some((target) => knowledgePoint.name.includes(target))) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestKnowledgePointId = knowledgePoint.id;
    }
  }

  if (bestScore <= 0) {
    return (
      knowledgePoints.find((item) => item.name.includes('综合'))?.id ??
      knowledgePoints.find((item) => item.name.includes('应用'))?.id ??
      knowledgePoints[0].id
    );
  }

  return bestKnowledgePointId;
}
