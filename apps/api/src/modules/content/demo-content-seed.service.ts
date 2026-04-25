import { Injectable, OnModuleInit } from '@nestjs/common';
import { Question, QuestionAnswerMode, QuestionBlock, Subject, TextbookVolume } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';

type DemoBlockTemplate =
  | { type: 'text'; text: string }
  | { type: 'math_display'; latex: string }
  | { type: 'divider' };

type DemoOptionTemplate = {
  label: string;
  value: string;
  content?: string;
};

type DemoQuestionFixture = {
  stem: string;
  answer: string | number;
  analysis: string;
  difficultyLevel: number;
  mode: QuestionAnswerMode;
  placeholder?: string;
  options?: DemoOptionTemplate[];
  blocks: DemoBlockTemplate[];
  knowledgePointName: string;
};

type DemoSubjectFixture = {
  subject: Subject;
  label: string;
  volume: Pick<TextbookVolume, 'grade' | 'term' | 'publisherVersion' | 'displayName' | 'sourcePath'>;
  unitTitle: string;
  lessonTitle: string;
  knowledgePointNames: string[];
  questions: DemoQuestionFixture[];
};

const demoSourceName = '内置示例题库';

@Injectable()
export class DemoContentSeedService implements OnModuleInit {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
  ) {}

  onModuleInit() {
    this.seedBuiltInContent();
  }

  private seedBuiltInContent() {
    if (
      this.store.textbookVolumes.length > 0 ||
      this.store.knowledgePoints.length > 0 ||
      this.store.questions.length > 0
    ) {
      return;
    }

    for (const fixture of this.buildFixtures()) {
      this.seedSubjectFixture(fixture);
    }
  }

  private seedSubjectFixture(fixture: DemoSubjectFixture) {
    const volumeId = this.store.nextId('volume');
    const lessonId = this.store.nextId('lesson');

    this.store.textbookVolumes.push({
      id: volumeId,
      subject: fixture.subject,
      publisherVersion: fixture.volume.publisherVersion,
      grade: fixture.volume.grade,
      term: fixture.volume.term,
      displayName: fixture.volume.displayName,
      sourcePath: fixture.volume.sourcePath,
      status: 'published',
    });

    this.store.textbookUnits.push({
      id: this.store.nextId('unit'),
      volumeId,
      title: fixture.unitTitle,
      sortOrder: 1,
    });

    this.store.textbookLessons.push({
      id: lessonId,
      unitId: this.store.textbookUnits[this.store.textbookUnits.length - 1].id,
      title: fixture.lessonTitle,
      sortOrder: 1,
    });

    const knowledgePointIds = new Map<string, string>();
    fixture.knowledgePointNames.forEach((name, index) => {
      const knowledgePointId = this.store.nextId('kp');
      this.store.knowledgePoints.push({
        id: knowledgePointId,
        subject: fixture.subject,
        name,
        parentId: null,
        gradeBand: '3',
        difficultyLevel: Math.min(index + 1, 3),
        lessonId,
        status: 'published',
      });
      knowledgePointIds.set(name, knowledgePointId);
    });

    fixture.questions.forEach((questionFixture, index) => {
      const knowledgePointId = knowledgePointIds.get(questionFixture.knowledgePointName);
      if (!knowledgePointId) {
        return;
      }

      const question: Question = {
        id: this.store.nextId('question'),
        subject: fixture.subject,
        type: 'objective',
        stem: questionFixture.stem,
        answer: questionFixture.answer,
        analysis: questionFixture.analysis,
        difficultyLevel: questionFixture.difficultyLevel,
        knowledgePointIds: [knowledgePointId],
        status: 'published',
      };

      this.store.questions.push(question);

      const workspace = this.questionWorkspaceService.initializeQuestionWorkspace(question, demoSourceName);
      workspace.document.blocks = this.buildQuestionBlocks(questionFixture.blocks);
      workspace.document.layoutMode = 'default';
      workspace.document.attachments = [];
      workspace.document.accessibilityConfig = {};

      workspace.answerSchema.mode = questionFixture.mode;
      workspace.answerSchema.responseShape = this.buildResponseShape(questionFixture.mode);
      workspace.answerSchema.validationRules = {
        required: true,
      };
      workspace.answerSchema.gradingConfig = {
        seed: 'builtin_demo',
        questionIndex: index + 1,
        expectedAnswer: questionFixture.answer,
      };
      workspace.answerSchema.options = questionFixture.options?.map((option) => ({
        id: this.store.nextId('option'),
        label: option.label,
        value: option.value,
        content: option.content ?? null,
      }));
      workspace.answerSchema.placeholder = questionFixture.placeholder ?? this.resolvePlaceholder(questionFixture.mode);

      workspace.source.sourceType = 'internal_authoring';
      workspace.source.sourceName = demoSourceName;
      workspace.source.sourcePathOrUrl = `builtin://demo/${fixture.subject}/question-${index + 1}`;
      workspace.source.licenseClass = 'A_INTERNAL';
      workspace.source.licenseName = 'builtin-demo-content';
      workspace.source.importJobId = null;
      workspace.source.reviewStatus = 'approved';
      workspace.source.notes = `应用启动时自动注入的${fixture.label}示例题目`;
    });
  }

  private buildQuestionBlocks(blocks: DemoBlockTemplate[]): QuestionBlock[] {
    return blocks.map((block) => ({
      id: this.store.nextId('block'),
      ...block,
    }));
  }

  private buildResponseShape(mode: QuestionAnswerMode): Record<string, unknown> {
    switch (mode) {
      case 'single_choice':
      case 'boolean':
      case 'text_blank':
      case 'formula_blank':
      case 'short_answer':
        return { value: 'string' };
      case 'numeric_blank':
        return { value: 'number' };
      default:
        return { value: 'string' };
    }
  }

  private resolvePlaceholder(mode: QuestionAnswerMode) {
    switch (mode) {
      case 'single_choice':
        return '请选择正确答案';
      case 'numeric_blank':
        return '请输入数字答案';
      case 'formula_blank':
        return '请输入公式';
      default:
        return '请输入答案';
    }
  }

  private buildFixtures(): DemoSubjectFixture[] {
    return [
      {
        subject: 'chinese',
        label: '语文',
        volume: {
          grade: 3,
          term: 'first',
          publisherVersion: '内置示例版',
          displayName: '语文三年级上册（内置示例）',
          sourcePath: 'builtin://textbooks/chinese/grade-3-first',
        },
        unitTitle: '内置示例单元',
        lessonTitle: '语文基础阅读与积累',
        knowledgePointNames: ['阅读理解', '古诗积累', '词语运用'],
        questions: [
          {
            stem: '“秋天的雨，是一把钥匙。”这句话里，把什么比作钥匙？',
            answer: '秋天的雨',
            analysis: '找到比喻句中的本体，写出被比作钥匙的对象。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: '请输入原文中的对象',
            blocks: [
              { type: 'text', text: '阅读句子并回答问题。' },
              { type: 'text', text: '“秋天的雨，是一把钥匙。”' },
            ],
            knowledgePointName: '阅读理解',
          },
          {
            stem: '下面哪个词语表示颜色？',
            answer: 'B',
            analysis: '颜色词能直接描述事物的色彩。',
            difficultyLevel: 1,
            mode: 'single_choice',
            options: [
              { label: 'A', value: 'A', content: '奔跑' },
              { label: 'B', value: 'B', content: '金黄' },
              { label: 'C', value: 'C', content: '思考' },
              { label: 'D', value: 'D', content: '整理' },
            ],
            blocks: [
              { type: 'text', text: '请选择表示颜色的词语。' },
            ],
            knowledgePointName: '词语运用',
          },
          {
            stem: '“春眠不觉晓”的下一句是什么？',
            answer: '处处闻啼鸟',
            analysis: '根据古诗《春晓》补出下一句。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: '请输入下一句',
            blocks: [
              { type: 'text', text: '请补全诗句。' },
              { type: 'text', text: '春眠不觉晓，____。' },
            ],
            knowledgePointName: '古诗积累',
          },
          {
            stem: '下面哪个句子用了比喻？',
            answer: 'A',
            analysis: '出现“像、好像”并把一种事物比作另一种事物，常常是在用比喻。',
            difficultyLevel: 2,
            mode: 'single_choice',
            options: [
              { label: 'A', value: 'A', content: '小河像一面明亮的镜子。' },
              { label: 'B', value: 'B', content: '我今天认真写作业。' },
              { label: 'C', value: 'C', content: '教室里很安静。' },
              { label: 'D', value: 'D', content: '我们一起去操场。' },
            ],
            blocks: [
              { type: 'text', text: '选择使用了比喻的句子。' },
            ],
            knowledgePointName: '阅读理解',
          },
          {
            stem: '在句子“他（）地写作业”中填入最合适的词语。',
            answer: '认真',
            analysis: '结合语境，填写能说明写作业状态的词语。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: '请输入合适的词语',
            blocks: [
              { type: 'text', text: '按要求填空。' },
              { type: 'text', text: '他（）地写作业。' },
            ],
            knowledgePointName: '词语运用',
          },
        ],
      },
      {
        subject: 'math',
        label: '数学',
        volume: {
          grade: 3,
          term: 'first',
          publisherVersion: '内置示例版',
          displayName: '数学三年级上册（内置示例）',
          sourcePath: 'builtin://textbooks/math/grade-3-first',
        },
        unitTitle: '内置示例单元',
        lessonTitle: '数学基础计算',
        knowledgePointNames: ['表内乘法', '表内除法', '数的认识'],
        questions: [
          {
            stem: '36 ÷ 6 = ?',
            answer: 6,
            analysis: '直接使用表内除法计算即可。',
            difficultyLevel: 1,
            mode: 'numeric_blank',
            blocks: [
              { type: 'text', text: '请计算下面的算式。' },
              { type: 'math_display', latex: '36 \\div 6 = \\square' },
            ],
            knowledgePointName: '表内除法',
          },
          {
            stem: '7 × 8 = ?',
            answer: 56,
            analysis: '根据乘法口诀“七八五十六”作答。',
            difficultyLevel: 1,
            mode: 'numeric_blank',
            blocks: [
              { type: 'text', text: '请计算下面的算式。' },
              { type: 'math_display', latex: '7 \\times 8 = \\square' },
            ],
            knowledgePointName: '表内乘法',
          },
          {
            stem: '下面哪个数是偶数？',
            answer: 'C',
            analysis: '偶数能被 2 整除，个位是 0、2、4、6、8。',
            difficultyLevel: 1,
            mode: 'single_choice',
            options: [
              { label: 'A', value: 'A', content: '13' },
              { label: 'B', value: 'B', content: '17' },
              { label: 'C', value: 'C', content: '18' },
              { label: 'D', value: 'D', content: '19' },
            ],
            blocks: [
              { type: 'text', text: '请选择正确答案。' },
            ],
            knowledgePointName: '数的认识',
          },
          {
            stem: '48 ÷ 8 = ?',
            answer: 6,
            analysis: '根据乘除法关系，可知 8 乘 6 等于 48。',
            difficultyLevel: 1,
            mode: 'numeric_blank',
            blocks: [
              { type: 'text', text: '请计算下面的算式。' },
              { type: 'math_display', latex: '48 \\div 8 = \\square' },
            ],
            knowledgePointName: '表内除法',
          },
          {
            stem: '把 24 写成 3 和几相乘？',
            answer: 8,
            analysis: '想一想 3 乘几等于 24。',
            difficultyLevel: 2,
            mode: 'numeric_blank',
            blocks: [
              { type: 'text', text: '请填空。' },
              { type: 'math_display', latex: '3 \\times \\square = 24' },
            ],
            knowledgePointName: '表内乘法',
          },
        ],
      },
      {
        subject: 'english',
        label: '英语',
        volume: {
          grade: 3,
          term: 'first',
          publisherVersion: '内置示例版',
          displayName: '英语三年级上册（内置示例）',
          sourcePath: 'builtin://textbooks/english/grade-3-first',
        },
        unitTitle: '内置示例单元',
        lessonTitle: '英语基础句型与词汇',
        knowledgePointNames: ['基础句型', '核心词汇', '日常表达'],
        questions: [
          {
            stem: 'Complete the sentence: This is my ____. ',
            answer: 'teacher',
            analysis: '根据常见课堂句型填写正确单词。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: 'Type the missing word',
            blocks: [
              { type: 'text', text: 'Read the sentence and fill in the blank.' },
              { type: 'text', text: 'This is my ____.' },
            ],
            knowledgePointName: '基础句型',
          },
          {
            stem: 'Which word means a person?',
            answer: 'B',
            analysis: '只有 teacher 表示人，其余都是物品或动作。',
            difficultyLevel: 1,
            mode: 'single_choice',
            options: [
              { label: 'A', value: 'A', content: 'apple' },
              { label: 'B', value: 'B', content: 'teacher' },
              { label: 'C', value: 'C', content: 'desk' },
              { label: 'D', value: 'D', content: 'run' },
            ],
            blocks: [
              { type: 'text', text: 'Choose the correct answer.' },
            ],
            knowledgePointName: '核心词汇',
          },
          {
            stem: '“Good morning” means ____ in Chinese.',
            answer: '早上好',
            analysis: '这是常见的早晨问候语。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: '请输入中文意思',
            blocks: [
              { type: 'text', text: 'Write the Chinese meaning.' },
              { type: 'text', text: 'Good morning = ____' },
            ],
            knowledgePointName: '日常表达',
          },
          {
            stem: 'I have a red ____. ',
            answer: 'bag',
            analysis: '结合常见物品词汇填写正确单词。',
            difficultyLevel: 1,
            mode: 'text_blank',
            placeholder: 'Type the missing word',
            blocks: [
              { type: 'text', text: 'Fill in the blank with one word.' },
              { type: 'text', text: 'I have a red ____.' },
            ],
            knowledgePointName: '核心词汇',
          },
          {
            stem: 'Choose the correct greeting in the morning.',
            answer: 'A',
            analysis: '早晨见面通常说 Good morning。',
            difficultyLevel: 1,
            mode: 'single_choice',
            options: [
              { label: 'A', value: 'A', content: 'Good morning' },
              { label: 'B', value: 'B', content: 'Good night' },
              { label: 'C', value: 'C', content: 'Goodbye' },
              { label: 'D', value: 'D', content: 'Thank you' },
            ],
            blocks: [
              { type: 'text', text: 'Choose the best answer.' },
            ],
            knowledgePointName: '日常表达',
          },
        ],
      },
    ];
  }
}
