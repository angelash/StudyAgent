'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  QuestionAnswerMode,
  QuestionBlock,
  QuestionImportAiSuggestion,
  QuestionImportJob,
  QuestionImportRecord,
  QuestionRenderPayload,
  StudentAnswerPayload,
  Subject,
} from '@study-agent/contracts';
import { FormulaInput } from '../../../components/formula-input';
import { QuestionRenderer, createEmptyAnswerPayload } from '../../../components/question-renderer';
import { apiRequest, getAuthToken } from '../../../lib/api';

type Volume = {
  id: string;
  displayName: string;
};

type KnowledgePoint = {
  id: string;
  name: string;
};

type QuestionSummary = {
  id: string;
  stem: string;
  status: string;
  knowledgePointIds: string[];
};

type ChoiceOption = {
  id: string;
  label: string;
  value: string;
  content: string;
};

type MultiBlankItem = {
  id: string;
  label: string;
  answer: string;
};

type ImportReviewResult = {
  record: QuestionImportRecord;
  question: {
    id: string;
    stem: string;
    status: string;
  } | null;
};

type ImportAiStructureResult = {
  record: QuestionImportRecord;
  suggestion: QuestionImportAiSuggestion;
};

type EditorBlock =
  | {
      id: string;
      type: 'text';
      text: string;
    }
  | {
      id: string;
      type: 'math_display';
      latex: string;
    }
  | {
      id: string;
      type: 'image';
      url: string;
      caption: string;
    }
  | {
      id: string;
      type: 'divider';
    };

const answerModeOptions: Array<{ value: QuestionAnswerMode; label: string; hint: string }> = [
  { value: 'formula_blank', label: '公式填空', hint: '适合数学公式、分式、方程' },
  { value: 'text_blank', label: '文本填空', hint: '适合普通文本或简单数字' },
  { value: 'multi_blank', label: '多空填空', hint: '适合多个空位、分项作答或图文联动题' },
  { value: 'single_choice', label: '单选题', hint: '适合概念判断和基础选择' },
  { value: 'short_answer', label: '简答题', hint: '适合简要说明题' },
  { value: 'stepwise', label: '分步作答', hint: '适合过程题和列式题' },
];

const subjectMeta: Record<
  Subject,
  {
    label: string;
    importPath: string;
    prepCopy: string;
    importCopy: string;
  }
> = {
  chinese: {
    label: '语文',
    importPath: 'E:\\ChinaTextbook\\小学\\语文\\人教版\\义务教育教科书·语文三年级上册.pdf',
    prepCopy: '先把语文教材和知识点准备好，后续导入候选、阅读题和表达题都会按语文学科归档。',
    importCopy: '支持整册教材、阅读题和表达题导入，适合阅读理解、字词句和习作训练素材沉淀。',
  },
  math: {
    label: '数学',
    importPath: 'E:\\ChinaTextbook\\小学\\数学\\人教版\\义务教育教科书 · 数学二年级上册.pdf',
    prepCopy: '先把数学教材和知识点准备好，结构化题目发布时会自动绑定到对应知识点。',
    importCopy: '支持整册教材、例题与练习页导入，适合计算题、应用题和图文题结构化沉淀。',
  },
  english: {
    label: '英语',
    importPath: 'E:\\ChinaTextbook\\小学\\英语\\人教版\\义务教育教科书·英语（PEP）（三年级起点）三年级上册.pdf',
    prepCopy: '先把英语教材和知识点准备好，后续词汇、句型、阅读和对话题都会按英语学科组织。',
    importCopy: '支持教材页、单词句型与阅读材料导入，适合单词拼写、选词填空和阅读理解沉淀。',
  },
};

function createSubjectPreset(subject: Subject) {
  switch (subject) {
    case 'chinese':
      return {
        knowledgePointName: '三年级上册·阅读理解',
        questionTitle: '阅读短文《秋天的雨》，回答“为什么说秋天像一把钥匙”？',
        analysis: '先定位原文关键句，再结合上下文概括秋天带来变化的原因，避免只摘抄半句。',
        answerMode: 'short_answer' as QuestionAnswerMode,
        blocks: [
          { id: createId('block'), type: 'text' as const, text: '阅读下面的短文片段，再回答问题。' },
          {
            id: createId('block'),
            type: 'text' as const,
            text: '秋天的雨，是一把钥匙。它带着清凉和温柔，轻轻地，轻轻地，趁你没留意，把秋天的大门打开了。',
          },
          { id: createId('block'), type: 'divider' as const },
          { id: createId('block'), type: 'text' as const, text: '问题：为什么说“秋天的雨，是一把钥匙”？' },
        ],
        formulaAnswer: '',
        textAnswer: '因为秋天的雨悄悄带来了季节变化，像钥匙一样打开了秋天的大门。',
        stepwiseAnswer: '第一步：找到文中“把秋天的大门打开了”。\n第二步：概括“钥匙”比喻秋雨带来秋天。 ',
        multiBlankItems: [
          { id: createId('blank'), label: '比喻对象', answer: '钥匙' },
          { id: createId('blank'), label: '作用', answer: '打开秋天的大门' },
        ],
        choiceOptions: [
          { id: createId('option'), label: 'A', value: 'A', content: '因为秋天的雨带来了季节变化' },
          { id: createId('option'), label: 'B', value: 'B', content: '因为秋天的雨颜色很好看' },
          { id: createId('option'), label: 'C', value: 'C', content: '因为秋天的雨声音很大' },
          { id: createId('option'), label: 'D', value: 'D', content: '因为秋天的雨下得特别久' },
        ],
        correctChoiceValue: 'A',
      };
    case 'english':
      return {
        knowledgePointName: '三年级上册·基础句型',
        questionTitle: 'Look at the picture and complete the sentence: This is my ____.',
        analysis: '先判断图片对应的人物，再把单词完整拼写出来，注意大小写和单复数。',
        answerMode: 'text_blank' as QuestionAnswerMode,
        blocks: [
          { id: createId('block'), type: 'text' as const, text: 'Read the sentence and fill in the blank.' },
          { id: createId('block'), type: 'image' as const, url: 'https://placehold.co/640x360/png', caption: 'Replace with a real classroom or family picture.' },
          { id: createId('block'), type: 'text' as const, text: 'Sentence: This is my teacher.' },
        ],
        formulaAnswer: '',
        textAnswer: 'teacher',
        stepwiseAnswer: 'Step 1: Look at the picture.\nStep 2: Identify the person.\nStep 3: Write the correct word.',
        multiBlankItems: [
          { id: createId('blank'), label: '单词', answer: 'teacher' },
          { id: createId('blank'), label: '句型主语', answer: 'This' },
        ],
        choiceOptions: [
          { id: createId('option'), label: 'A', value: 'A', content: 'teacher' },
          { id: createId('option'), label: 'B', value: 'B', content: 'apple' },
          { id: createId('option'), label: 'C', value: 'C', content: 'desk' },
          { id: createId('option'), label: 'D', value: 'D', content: 'bag' },
        ],
        correctChoiceValue: 'A',
      };
    case 'math':
    default:
      return {
        knowledgePointName: '表内除法',
        questionTitle: '把 36 ÷ 6 写成分式并填写结果',
        analysis: '先把除法写成分式，再判断是否需要继续化简。',
        answerMode: 'formula_blank' as QuestionAnswerMode,
        blocks: [
          { id: createId('block'), type: 'text' as const, text: '请先把算式写成分式，再填写答案。' },
          { id: createId('block'), type: 'math_display' as const, latex: '36 \\div 6 = ?' },
        ],
        formulaAnswer: '\\frac{36}{6}',
        textAnswer: '6',
        stepwiseAnswer: '第一步：把 36 ÷ 6 写成分式。\n第二步：得到 \\frac{36}{6}。',
        multiBlankItems: [
          { id: createId('blank'), label: '第 1 空', answer: '6' },
          { id: createId('blank'), label: '第 2 空', answer: '厘米' },
        ],
        choiceOptions: [
          { id: createId('option'), label: 'A', value: 'A', content: '6' },
          { id: createId('option'), label: 'B', value: 'B', content: '5' },
          { id: createId('option'), label: 'C', value: 'C', content: '4' },
          { id: createId('option'), label: 'D', value: 'D', content: '3' },
        ],
        correctChoiceValue: 'A',
      };
  }
}

export default function AdminContentPage() {
  const [selectedSubject, setSelectedSubject] = React.useState<Subject>('math');
  const subjectProfile = React.useMemo(() => subjectMeta[selectedSubject], [selectedSubject]);
  const initialPreset = React.useMemo(() => createSubjectPreset(selectedSubject), [selectedSubject]);
  const [volumes, setVolumes] = React.useState<Volume[]>([]);
  const [knowledgePoints, setKnowledgePoints] = React.useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = React.useState<QuestionSummary[]>([]);
  const [importJobs, setImportJobs] = React.useState<QuestionImportJob[]>([]);
  const [importRecords, setImportRecords] = React.useState<QuestionImportRecord[]>([]);

  const [knowledgePointName, setKnowledgePointName] = React.useState(initialPreset.knowledgePointName);
  const [questionTitle, setQuestionTitle] = React.useState(initialPreset.questionTitle);
  const [analysis, setAnalysis] = React.useState(initialPreset.analysis);
  const [difficultyLevel, setDifficultyLevel] = React.useState(2);
  const [selectedKnowledgePointId, setSelectedKnowledgePointId] = React.useState('');
  const [importSourcePath, setImportSourcePath] = React.useState(initialPreset ? subjectProfile.importPath : '');
  const [selectedImportJobId, setSelectedImportJobId] = React.useState('');
  const [answerMode, setAnswerMode] = React.useState<QuestionAnswerMode>(initialPreset.answerMode);

  const [blocks, setBlocks] = React.useState<EditorBlock[]>(initialPreset.blocks);
  const [formulaAnswer, setFormulaAnswer] = React.useState(initialPreset.formulaAnswer);
  const [textAnswer, setTextAnswer] = React.useState(initialPreset.textAnswer);
  const [stepwiseAnswer, setStepwiseAnswer] = React.useState(initialPreset.stepwiseAnswer);
  const [multiBlankItems, setMultiBlankItems] = React.useState<MultiBlankItem[]>(initialPreset.multiBlankItems);
  const [choiceOptions, setChoiceOptions] = React.useState<ChoiceOption[]>(initialPreset.choiceOptions);
  const [correctChoiceValue, setCorrectChoiceValue] = React.useState(initialPreset.correctChoiceValue);

  const [previewAnswer, setPreviewAnswer] = React.useState<StudentAnswerPayload | null>(null);
  const [latestPublishedPayload, setLatestPublishedPayload] = React.useState<QuestionRenderPayload | null>(null);
  const [latestPublishedAnswer, setLatestPublishedAnswer] = React.useState<StudentAnswerPayload | null>(null);

  const [savingQuestion, setSavingQuestion] = React.useState(false);
  const [creatingImportJob, setCreatingImportJob] = React.useState(false);
  const [loadingImportRecords, setLoadingImportRecords] = React.useState(false);
  const [reviewingRecordId, setReviewingRecordId] = React.useState<string | null>(null);
  const [structuringRecordId, setStructuringRecordId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function reload() {
    try {
      setError(null);
      const token = getAuthToken();
      const [volumesResult, knowledgeResult, questionResult, importJobResult] = await Promise.all([
        apiRequest<Volume[]>(`/textbooks?subject=${selectedSubject}`),
        apiRequest<KnowledgePoint[]>(`/knowledge-points?subject=${selectedSubject}`),
        apiRequest<QuestionSummary[]>(`/questions?subject=${selectedSubject}`),
        token ? apiRequest<QuestionImportJob[]>('/admin/question-import-jobs', {}, token) : Promise.resolve([]),
      ]);
      const scopedImportJobs = importJobResult.filter((item) => item.subject === selectedSubject);
      setVolumes(volumesResult);
      setKnowledgePoints(knowledgeResult);
      setQuestions(questionResult);
      setImportJobs(scopedImportJobs);

      setSelectedKnowledgePointId((current) => current || knowledgeResult[0]?.id || '');
      setSelectedImportJobId((current) => {
        if (current && scopedImportJobs.some((item) => item.id === current)) {
          return current;
        }
        return scopedImportJobs[0]?.id ?? '';
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '内容后台加载失败');
    }
  }

  React.useEffect(() => {
    void reload();
  }, [selectedSubject]);

  React.useEffect(() => {
    const preset = createSubjectPreset(selectedSubject);
    setKnowledgePointName(preset.knowledgePointName);
    setQuestionTitle(preset.questionTitle);
    setAnalysis(preset.analysis);
    setImportSourcePath(subjectMeta[selectedSubject].importPath);
    setAnswerMode(preset.answerMode);
    setBlocks(preset.blocks);
    setFormulaAnswer(preset.formulaAnswer);
    setTextAnswer(preset.textAnswer);
    setStepwiseAnswer(preset.stepwiseAnswer);
    setMultiBlankItems(preset.multiBlankItems);
    setChoiceOptions(preset.choiceOptions);
    setCorrectChoiceValue(preset.correctChoiceValue);
    setSelectedKnowledgePointId('');
    setSelectedImportJobId('');
    setImportRecords([]);
    setLatestPublishedPayload(null);
    setLatestPublishedAnswer(null);
  }, [selectedSubject]);

  React.useEffect(() => {
    if (!selectedImportJobId) {
      setImportRecords([]);
      return;
    }
    void loadImportRecords(selectedImportJobId);
  }, [selectedImportJobId]);

  const draftRenderPayload = React.useMemo<QuestionRenderPayload>(
    () => ({
      question: {
        id: 'draft_preview_question',
        subject: selectedSubject,
        type: resolveQuestionType(answerMode),
        difficultyLevel,
        status: 'draft',
      },
      document: {
        questionId: 'draft_preview_question',
        version: 1,
        locale: 'zh-CN',
        blocks: toQuestionBlocks(blocks, questionTitle),
        attachments: [],
        layoutMode: blocks.some((item) => item.type === 'image') ? 'reading_split' : 'default',
        accessibilityConfig: {},
      },
      answerSchema: buildAnswerSchema('draft_preview_question', answerMode, choiceOptions, multiBlankItems),
      source: {
        questionId: 'draft_preview_question',
        sourceType: 'internal_authoring',
        sourceName: '后台编辑器草稿',
        sourcePathOrUrl: 'draft://admin-editor',
        licenseClass: 'A_INTERNAL',
        licenseName: 'internal-authoring',
        importJobId: null,
        reviewStatus: 'approved',
        notes: '当前为后台实时预览草稿',
      },
    }),
    [answerMode, blocks, choiceOptions, difficultyLevel, multiBlankItems, questionTitle, selectedSubject],
  );

  React.useEffect(() => {
    setPreviewAnswer(createEmptyAnswerPayload(draftRenderPayload));
  }, [draftRenderPayload]);

  async function importTextbooks() {
    try {
      setError(null);
      setMessage(null);
      const result = await apiRequest<{ importedCount: number }>(
        '/admin/textbooks/import',
        { method: 'POST', body: JSON.stringify({ subject: selectedSubject }) },
        getAuthToken(),
      );
      setMessage(`已导入 ${result.importedCount} 本${subjectProfile.label}教材`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '教材导入失败');
    }
  }

  async function createKnowledgePoint() {
    try {
      setError(null);
      setMessage(null);
      const lessonId =
        volumes.length > 0
          ? (
              await apiRequest<{ volume: { id: string }; units: Array<{ lessons: Array<{ id: string }> }> }>(
                `/textbooks/${volumes[0].id}/tree`,
              )
            ).units[0]?.lessons[0]?.id ?? null
          : null;
      await apiRequest(
        '/admin/knowledge-points',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: selectedSubject,
            name: knowledgePointName,
            parentId: null,
            gradeBand: '2-3',
            difficultyLevel: 2,
            lessonId,
            status: 'published',
          }),
        },
        getAuthToken(),
      );
      setMessage(`已创建${subjectProfile.label}知识点：${knowledgePointName}`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '知识点创建失败');
    }
  }

  async function createStructuredQuestion() {
    if (!selectedKnowledgePointId) {
      setError('请先创建并选择一个知识点');
      return;
    }

    try {
      setSavingQuestion(true);
      setError(null);
      setMessage(null);

      const created = await apiRequest<QuestionSummary>(
        '/admin/questions',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: selectedSubject,
            type: resolveQuestionType(answerMode),
            stem: questionTitle,
            answer: buildLegacyAnswer(answerMode, {
              formulaAnswer,
              textAnswer,
              stepwiseAnswer,
              multiBlankItems,
              choiceOptions,
              correctChoiceValue,
            }),
            analysis,
            difficultyLevel,
          }),
        },
        getAuthToken(),
      );

      await apiRequest(
        `/admin/questions/${created.id}/document`,
        {
          method: 'POST',
          body: JSON.stringify({
            locale: 'zh-CN',
            blocks: toQuestionBlocks(blocks, questionTitle),
            attachments: [],
            layoutMode: blocks.some((item) => item.type === 'image') ? 'reading_split' : 'default',
            accessibilityConfig: {},
          }),
        },
        getAuthToken(),
      );

      await apiRequest(
        `/admin/questions/${created.id}/answer-schema`,
        {
          method: 'POST',
          body: JSON.stringify(buildAnswerSchema(created.id, answerMode, choiceOptions, multiBlankItems)),
        },
        getAuthToken(),
      );

      await apiRequest(
        `/admin/questions/${created.id}/knowledge-points`,
        {
          method: 'POST',
          body: JSON.stringify({
            knowledgePointIds: [selectedKnowledgePointId],
          }),
        },
        getAuthToken(),
      );

      await apiRequest(`/admin/questions/${created.id}/publish`, { method: 'PATCH' }, getAuthToken());
      const runtimePayload = await apiRequest<QuestionRenderPayload>(`/questions/${created.id}/render`);
      setLatestPublishedPayload(runtimePayload);
      setLatestPublishedAnswer(createEmptyAnswerPayload(runtimePayload));

      setMessage(`已创建并发布${subjectProfile.label}结构化题目：${questionTitle}`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '结构化题目创建失败');
    } finally {
      setSavingQuestion(false);
    }
  }

  async function loadImportRecords(jobId: string) {
    try {
      setLoadingImportRecords(true);
      setError(null);
      const records = await apiRequest<QuestionImportRecord[]>(
        `/admin/question-import-jobs/${jobId}/records`,
        {},
        getAuthToken(),
      );
      setImportRecords(records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入记录加载失败');
    } finally {
      setLoadingImportRecords(false);
    }
  }

  async function createImportJob() {
    if (!importSourcePath.trim()) {
      setError('请填写教材 PDF 或教材目录路径');
      return;
    }

    try {
      setCreatingImportJob(true);
      setError(null);
      setMessage(null);

      const created = await apiRequest<QuestionImportJob>(
        '/admin/question-import-jobs',
        {
          method: 'POST',
          body: JSON.stringify({
            importType: 'textbook_pdf',
            subject: selectedSubject,
            sourcePathOrUrl: importSourcePath.trim(),
            sourcePolicy: {
              sourceType: 'internal_textbook',
              licenseClass: 'A_INTERNAL',
              licenseName: 'ChinaTextbook',
            },
          }),
        },
        getAuthToken(),
      );

      setSelectedImportJobId(created.id);
      await reload();
      await loadImportRecords(created.id);

      if (created.status === 'completed') {
        setMessage(`导入任务已完成，生成 ${created.recordCount} 条候选记录，警告 ${created.warningCount} 条。`);
      } else {
        setMessage(`导入任务状态：${formatImportJobStatus(created.status)}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '教材导入任务创建失败');
    } finally {
      setCreatingImportJob(false);
    }
  }

  async function reviewImportRecord(recordId: string, decision: 'approved' | 'rejected') {
    try {
      setReviewingRecordId(recordId);
      setError(null);
      setMessage(null);

      const result = await apiRequest<ImportReviewResult>(
        `/admin/question-import-records/${recordId}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            comment: decision === 'approved' ? '人工审核通过，转结构化草稿' : '人工审核驳回，暂不入库',
            knowledgePointIds: decision === 'approved' && selectedKnowledgePointId ? [selectedKnowledgePointId] : [],
            createDraft: decision === 'approved',
          }),
        },
        getAuthToken(),
      );

      setImportRecords((current) => current.map((item) => (item.id === result.record.id ? result.record : item)));
      await reload();

      if (result.question) {
        setMessage(`候选题已审核通过，并生成草稿题目 ${result.question.id}。请继续补充答案、解析和作答协议后发布。`);
      } else {
        setMessage('候选题已标记为驳回，不会进入题库草稿。');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入记录审核失败');
    } finally {
      setReviewingRecordId(null);
    }
  }

  async function structureImportRecordWithAi(recordId: string) {
    try {
      setStructuringRecordId(recordId);
      setError(null);
      setMessage(null);

      const result = await apiRequest<ImportAiStructureResult>(
        `/admin/question-import-records/${recordId}/ai-structure`,
        {
          method: 'POST',
          body: '{}',
        },
        getAuthToken(),
      );

      setImportRecords((current) => current.map((item) => (item.id === result.record.id ? result.record : item)));
      setMessage(`AI 已生成结构化建议：${result.suggestion.suggestedStem}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI 结构化解析失败');
    } finally {
      setStructuringRecordId(null);
    }
  }

  function addBlock(type: EditorBlock['type']) {
    setBlocks((current) => [...current, createEditorBlock(type)]);
  }

  function updateBlock(id: string, patch: Partial<EditorBlock>) {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) {
          return block;
        }
        return { ...block, ...patch } as EditorBlock;
      }),
    );
  }

  function removeBlock(id: string) {
    setBlocks((current) => (current.length === 1 ? current : current.filter((block) => block.id !== id)));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) {
        return current;
      }
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [target] = next.splice(index, 1);
      next.splice(nextIndex, 0, target);
      return next;
    });
  }

  function updateChoiceOption(id: string, patch: Partial<ChoiceOption>) {
    setChoiceOptions((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addChoiceOption() {
    setChoiceOptions((current) => {
      const nextIndex = current.length;
      const nextLabel = String.fromCharCode(65 + Math.min(nextIndex, 25));
      return [
        ...current,
        {
          id: createId('option'),
          label: nextLabel,
          value: nextLabel,
          content: '',
        },
      ];
    });
  }

  function removeChoiceOption(id: string) {
    setChoiceOptions((current) => {
      const next = current.filter((item) => item.id !== id);
      if (next.length > 0 && !next.some((item) => item.value === correctChoiceValue)) {
        setCorrectChoiceValue(next[0].value);
      }
      return next.length > 0 ? next : current;
    });
  }

  function updateMultiBlankItem(id: string, patch: Partial<MultiBlankItem>) {
    setMultiBlankItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addMultiBlankItem() {
    setMultiBlankItems((current) => [
      ...current,
      {
        id: createId('blank'),
        label: `第 ${current.length + 1} 空`,
        answer: '',
      },
    ]);
  }

  function removeMultiBlankItem(id: string) {
    setMultiBlankItems((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  }

  return (
    <main style={{ padding: 40, maxWidth: 1320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>内容后台</h1>
          <p style={{ color: '#475569', lineHeight: 1.7, maxWidth: 760 }}>
            当前页已经升级为结构化题目工作台。运营可以在语文、数学、英语之间切换，配置块级题面、答案协议、教材导入和运行时预览。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/admin/analytics" style={headerLinkStyle}>
            查看运营看板
          </Link>
        </div>
      </div>

      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>当前学科</h2>
            <div style={{ color: '#64748b' }}>切换学科后，教材、知识点、题库、导入任务和助教模板都会同步切换。</div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(['chinese', 'math', 'english'] as Subject[]).map((subject) => {
              const selected = subject === selectedSubject;
              return (
                <button
                  key={subject}
                  type="button"
                  onClick={() => setSelectedSubject(subject)}
                  style={{
                    ...(selected ? primaryButtonStyle : secondaryButtonStyle),
                    minWidth: 112,
                  }}
                >
                  {subjectMeta[subject].label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>{subjectProfile.label}教材与知识点准备</h2>
            <div style={{ color: '#64748b' }}>{subjectProfile.prepCopy}</div>
          </div>
          <button onClick={importTextbooks} style={primaryButtonStyle}>
            导入{subjectProfile.label}教材
          </button>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 20 }}>
          <article style={cardStyle}>
            <div style={cardTitleStyle}>教材状态</div>
            <div style={metricValueStyle}>{volumes.length}</div>
            <div style={{ color: '#64748b' }}>已导入{subjectProfile.label}册次</div>
          </article>

          <article style={cardStyle}>
            <div style={cardTitleStyle}>创建知识点</div>
            <input
              value={knowledgePointName}
              onChange={(event) => setKnowledgePointName(event.target.value)}
              placeholder="知识点名称"
              style={inputStyle}
            />
            <button onClick={createKnowledgePoint} style={{ ...secondaryButtonStyle, marginTop: 12 }}>
              创建知识点
            </button>
            <div style={{ marginTop: 12, color: '#64748b' }}>当前{subjectProfile.label}知识点数量：{knowledgePoints.length}</div>
          </article>

          <article style={cardStyle}>
            <div style={cardTitleStyle}>发布题目总数</div>
            <div style={metricValueStyle}>{questions.filter((item) => item.status === 'published').length}</div>
            <div style={{ color: '#64748b' }}>{subjectProfile.label}草稿与已发布题目共 {questions.length} 条</div>
          </article>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>教材题目导入工作台</h2>
            <div style={{ color: '#64748b', maxWidth: 760, lineHeight: 1.7 }}>
              {subjectProfile.importCopy}
            </div>
          </div>
          <div style={statusPillStyle('#ecfeff', '#155e75')}>
            已接入真实导入链路，不做 mock 回填
          </div>
        </div>

        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', marginTop: 20 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <article style={cardStyle}>
              <div style={cardTitleStyle}>创建导入任务</div>
              <label style={{ ...labelStyle, marginTop: 14 }}>
                <span>教材路径</span>
                <input
                  value={importSourcePath}
                  onChange={(event) => setImportSourcePath(event.target.value)}
                  placeholder="输入本地 PDF 路径或教材目录路径"
                  style={inputStyle}
                />
                <small style={hintStyle}>
                  支持单个 PDF，也支持最多 5 本教材的目录级导入；拆分片段 `.pdf.1` 需先合并。当前将按{subjectProfile.label}学科入库。
                </small>
              </label>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                <button onClick={createImportJob} style={primaryButtonStyle} disabled={creatingImportJob}>
                  {creatingImportJob ? '导入中...' : '创建教材导入任务'}
                </button>
              </div>
            </article>

            <article style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={cardTitleStyle}>最近导入任务</div>
                <div style={{ color: '#64748b' }}>共 {importJobs.length} 条</div>
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                {importJobs.map((job) => {
                  const selected = job.id === selectedImportJobId;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedImportJobId(job.id)}
                      style={{
                        ...jobCardButtonStyle,
                        borderColor: selected ? '#0f172a' : '#e2e8f0',
                        background: selected ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <strong>{job.sourcePathOrUrl.split(/[\\/]/).filter(Boolean).at(-1) ?? job.sourcePathOrUrl}</strong>
                        <span style={statusPillStyle(getJobStatusTone(job.status).background, getJobStatusTone(job.status).color)}>
                          {formatImportJobStatus(job.status)}
                        </span>
                      </div>
                      <div style={{ color: '#475569', marginTop: 10 }}>学科：{subjectMeta[job.subject].label}</div>
                      <div style={{ color: '#64748b', marginTop: 10, textAlign: 'left', wordBreak: 'break-all' }}>{job.sourcePathOrUrl}</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, color: '#475569' }}>
                        <span>文件 {job.fileCount}</span>
                        <span>候选 {job.recordCount}</span>
                        <span>警告 {job.warningCount}</span>
                      </div>
                      {job.errorMessage ? <div style={{ marginTop: 10, color: '#b91c1c', textAlign: 'left' }}>{job.errorMessage}</div> : null}
                    </button>
                  );
                })}
                {importJobs.length === 0 ? <div style={{ color: '#64748b' }}>当前还没有导入任务，先从上面发起一条教材导入。</div> : null}
              </div>
            </article>
          </div>

          <article style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={cardTitleStyle}>候选记录审核</div>
                <div style={{ color: '#64748b', marginTop: 6 }}>
                  {selectedImportJobId
                    ? '选中一条导入任务后，这里会展示候选练习页与候选题摘要。'
                    : '先从左侧选中一个导入任务。'}
                </div>
              </div>
              {selectedImportJobId ? <div style={{ color: '#475569' }}>当前任务：{selectedImportJobId}</div> : null}
            </div>

            {loadingImportRecords ? <div style={{ marginTop: 18, color: '#64748b' }}>候选记录加载中...</div> : null}

            {!loadingImportRecords && importRecords.length > 0 ? (
              <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
                {importRecords.map((record) => {
                  const reviewTone = getReviewStatusTone(record.reviewStatus);
                  const qualityTone = getQualityTone(record.qualityLevel);
                  return (
                    <article key={record.id} style={importRecordCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <strong>{record.sourceName}</strong>
                          <div style={{ color: '#64748b', marginTop: 6 }}>
                            第 {record.pageNumber ?? '-'} 页 · 候选 {record.candidateIndexOnPage} · {record.splitMode === 'question' ? '题级切分' : '整页回退'} · 候选题 ID：{record.id}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={statusPillStyle(qualityTone.background, qualityTone.color)}>
                            质量 {formatQualityLevel(record.qualityLevel)}
                          </span>
                          <span style={statusPillStyle(reviewTone.background, reviewTone.color)}>
                            {formatImportReviewStatus(record.reviewStatus)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: record.previewImageDataUrl ? '220px minmax(0, 1fr)' : '1fr', marginTop: 16 }}>
                        {record.previewImageDataUrl ? (
                          <img
                            src={record.previewImageDataUrl}
                            alt={`${record.sourceName} 第 ${record.pageNumber ?? 1} 页预览`}
                            style={{
                              width: '100%',
                              borderRadius: 14,
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                            }}
                          />
                        ) : null}

                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <div style={subtleTitleStyle}>候选题干</div>
                            <div style={excerptStyle}>{record.candidateStem}</div>
                          </div>

                          <div>
                            <div style={subtleTitleStyle}>检测依据</div>
                            <div style={{ color: '#475569', lineHeight: 1.7 }}>{record.detectionReason}</div>
                          </div>

                          {record.qualityFlags.length > 0 ? (
                            <div>
                              <div style={subtleTitleStyle}>质量标记</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {record.qualityFlags.map((flag) => (
                                  <span key={flag} style={miniBadgeStyle}>
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {record.sectionLabel ? (
                            <div>
                              <div style={subtleTitleStyle}>所属小节</div>
                              <div style={{ color: '#475569', lineHeight: 1.7 }}>{record.sectionLabel}</div>
                            </div>
                          ) : null}

                          <div>
                            <div style={subtleTitleStyle}>页内摘录</div>
                            <div style={excerptStyle}>{record.excerpt}</div>
                          </div>

                          {record.candidateQuestionId ? (
                            <div style={{ color: '#0f766e' }}>已生成草稿题目：{record.candidateQuestionId}</div>
                          ) : null}

                          {record.aiSuggestion ? (
                            <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                              <div>
                                <div style={subtleTitleStyle}>AI 建议题干</div>
                                <div style={{ color: '#0f172a', lineHeight: 1.7 }}>{record.aiSuggestion.suggestedStem}</div>
                              </div>
                              {record.aiSuggestion.suggestedSectionLabel ? (
                                <div style={{ color: '#334155' }}>AI 建议小节：{record.aiSuggestion.suggestedSectionLabel}</div>
                              ) : null}
                              {record.aiSuggestion.suggestedAnswerMode ? (
                                <div style={{ color: '#334155' }}>AI 建议作答模式：{record.aiSuggestion.suggestedAnswerMode}</div>
                              ) : null}
                              <div style={{ color: '#334155' }}>AI 审核建议：{record.aiSuggestion.reviewAdvice}</div>
                              {record.aiSuggestion.actionablePoints.length > 0 ? (
                                <div style={{ color: '#334155', lineHeight: 1.7 }}>
                                  AI 可执行建议：{record.aiSuggestion.actionablePoints.join('；')}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {record.reviewComment ? <div style={{ color: '#64748b' }}>审核备注：{record.reviewComment}</div> : null}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                        <button
                          onClick={() => structureImportRecordWithAi(record.id)}
                          style={secondaryButtonStyle}
                          disabled={structuringRecordId === record.id}
                        >
                          {structuringRecordId === record.id ? 'AI 解析中...' : 'AI 重整候选'}
                        </button>
                        <button
                          onClick={() => reviewImportRecord(record.id, 'approved')}
                          style={primaryButtonStyle}
                          disabled={reviewingRecordId === record.id}
                        >
                          {reviewingRecordId === record.id ? '处理中...' : '审核通过并建草稿'}
                        </button>
                        <button
                          onClick={() => reviewImportRecord(record.id, 'rejected')}
                          style={ghostDangerButtonStyle}
                          disabled={reviewingRecordId === record.id}
                        >
                          驳回候选
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {!loadingImportRecords && selectedImportJobId && importRecords.length === 0 ? (
              <div style={{ marginTop: 18, color: '#64748b' }}>
                当前任务还没有候选记录。可能这本教材没有识别出练习页，或者命中了警告条件。
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 1.2fr) minmax(360px, 0.8fr)' }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <article style={cardStyle}>
              <div style={cardTitleStyle}>题目基础信息</div>
              <div style={fieldGridStyle}>
                <label style={labelStyle}>
                  <span>题目摘要</span>
                  <input value={questionTitle} onChange={(event) => setQuestionTitle(event.target.value)} style={inputStyle} />
                </label>

                <label style={labelStyle}>
                  <span>关联知识点</span>
                  <select
                    value={selectedKnowledgePointId}
                    onChange={(event) => setSelectedKnowledgePointId(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">请选择知识点</option>
                    {knowledgePoints.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  <span>作答模式</span>
                  <select
                    value={answerMode}
                    onChange={(event) => setAnswerMode(event.target.value as QuestionAnswerMode)}
                    style={inputStyle}
                  >
                    {answerModeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <small style={hintStyle}>
                    {answerModeOptions.find((item) => item.value === answerMode)?.hint ?? '选择题目的作答方式'}
                  </small>
                </label>

                <label style={labelStyle}>
                  <span>难度</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={difficultyLevel}
                    onChange={(event) => setDifficultyLevel(Number(event.target.value))}
                  />
                  <small style={hintStyle}>当前难度：{difficultyLevel}</small>
                </label>
              </div>

              <label style={{ ...labelStyle, marginTop: 18 }}>
                <span>题目解析</span>
                <textarea
                  value={analysis}
                  onChange={(event) => setAnalysis(event.target.value)}
                  rows={4}
                  style={textareaStyle}
                />
              </label>
            </article>

            <article style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={cardTitleStyle}>题面块编辑器</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => addBlock('text')} style={secondaryButtonStyle}>
                    添加文本块
                  </button>
                  <button onClick={() => addBlock('math_display')} style={secondaryButtonStyle}>
                    添加公式块
                  </button>
                  <button onClick={() => addBlock('image')} style={secondaryButtonStyle}>
                    添加图片块
                  </button>
                  <button onClick={() => addBlock('divider')} style={secondaryButtonStyle}>
                    添加分隔块
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
                {blocks.map((block, index) => (
                  <article key={block.id} style={blockCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <strong>块 {index + 1}</strong>
                        <span style={{ marginLeft: 8, color: '#64748b' }}>{block.type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => moveBlock(block.id, -1)} style={ghostButtonStyle}>
                          上移
                        </button>
                        <button onClick={() => moveBlock(block.id, 1)} style={ghostButtonStyle}>
                          下移
                        </button>
                        <button onClick={() => removeBlock(block.id)} style={ghostDangerButtonStyle}>
                          删除
                        </button>
                      </div>
                    </div>

                    {block.type === 'text' ? (
                      <textarea
                        value={block.text}
                        onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                        rows={4}
                        style={{ ...textareaStyle, marginTop: 12 }}
                      />
                    ) : null}

                    {block.type === 'math_display' ? (
                      <div style={{ marginTop: 12 }}>
                        <FormulaInput
                          value={block.latex}
                          onChange={(next) => updateBlock(block.id, { latex: next })}
                          placeholder="输入题面公式，例如 \\frac{36}{6} = ?"
                          minHeight={88}
                        />
                      </div>
                    ) : null}

                    {block.type === 'image' ? (
                      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                        <input
                          value={block.url}
                          onChange={(event) => updateBlock(block.id, { url: event.target.value })}
                          placeholder="图片 URL"
                          style={inputStyle}
                        />
                        <input
                          value={block.caption}
                          onChange={(event) => updateBlock(block.id, { caption: event.target.value })}
                          placeholder="图片说明"
                          style={inputStyle}
                        />
                      </div>
                    ) : null}

                    {block.type === 'divider' ? (
                      <div style={{ marginTop: 12, color: '#64748b' }}>这个块会在学生端渲染为一道分隔线，用于分组和视觉节奏控制。</div>
                    ) : null}
                  </article>
                ))}
              </div>
            </article>

            <article style={cardStyle}>
              <div style={cardTitleStyle}>作答协议配置</div>

              {answerMode === 'formula_blank' ? (
                <label style={labelStyle}>
                  <span>标准公式答案</span>
                  <FormulaInput value={formulaAnswer} onChange={setFormulaAnswer} placeholder="例如 \\frac{36}{6}" minHeight={88} />
                </label>
              ) : null}

              {answerMode === 'text_blank' ? (
                <label style={labelStyle}>
                  <span>标准文本答案</span>
                  <input value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} style={inputStyle} />
                </label>
              ) : null}

              {answerMode === 'multi_blank' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ color: '#475569' }}>为每个空位配置标签和标准答案，预览区会同步渲染多空输入。</div>
                    <button onClick={addMultiBlankItem} style={secondaryButtonStyle}>
                      添加空位
                    </button>
                  </div>
                  {multiBlankItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gap: 8,
                        padding: 12,
                        borderRadius: 14,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <strong>{item.label}</strong>
                        <button onClick={() => removeMultiBlankItem(item.id)} style={ghostDangerButtonStyle}>
                          删除
                        </button>
                      </div>
                      <input
                        value={item.label}
                        onChange={(event) => updateMultiBlankItem(item.id, { label: event.target.value })}
                        placeholder="空位标签，例如 第 1 空 / 左图钟面 / 单位"
                        style={inputStyle}
                      />
                      <input
                        value={item.answer}
                        onChange={(event) => updateMultiBlankItem(item.id, { answer: event.target.value })}
                        placeholder="标准答案"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {answerMode === 'short_answer' ? (
                <label style={labelStyle}>
                  <span>参考答案</span>
                  <textarea value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} rows={4} style={textareaStyle} />
                </label>
              ) : null}

              {answerMode === 'stepwise' ? (
                <label style={labelStyle}>
                  <span>标准步骤</span>
                  <textarea
                    value={stepwiseAnswer}
                    onChange={(event) => setStepwiseAnswer(event.target.value)}
                    rows={5}
                    style={textareaStyle}
                  />
                </label>
              ) : null}

              {answerMode === 'single_choice' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ color: '#475569' }}>配置选项内容并指定正确答案。</div>
                    <button onClick={addChoiceOption} style={secondaryButtonStyle}>
                      添加选项
                    </button>
                  </div>
                  {choiceOptions.map((option) => (
                    <div key={option.id} style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <strong>选项 {option.label}</strong>
                        <button onClick={() => removeChoiceOption(option.id)} style={ghostDangerButtonStyle}>
                          删除
                        </button>
                      </div>
                      <input
                        value={option.content}
                        onChange={(event) => updateChoiceOption(option.id, { content: event.target.value })}
                        placeholder={`填写 ${option.label} 选项内容`}
                        style={inputStyle}
                      />
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="radio"
                          name="correct-choice"
                          checked={correctChoiceValue === option.value}
                          onChange={() => setCorrectChoiceValue(option.value)}
                        />
                        设为正确答案
                      </label>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={createStructuredQuestion} style={primaryButtonStyle} disabled={savingQuestion}>
                {savingQuestion ? '发布中...' : '创建并发布结构化题目'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <article style={cardStyle}>
              <div style={cardTitleStyle}>草稿实时预览</div>
              <div style={{ color: '#64748b', marginBottom: 12 }}>这里直接复用学生端运行时渲染器，避免后台预览和学生端展示不一致。</div>
              <QuestionRenderer renderPayload={draftRenderPayload} answer={previewAnswer} onChange={setPreviewAnswer} />
            </article>

            <article style={cardStyle}>
              <div style={cardTitleStyle}>最近发布结果</div>
              {latestPublishedPayload && latestPublishedAnswer ? (
                <QuestionRenderer
                  renderPayload={latestPublishedPayload}
                  answer={latestPublishedAnswer}
                  onChange={setLatestPublishedAnswer}
                />
              ) : (
                <div style={{ color: '#64748b' }}>发布成功后，这里会展示后端返回的正式运行时 payload。</div>
              )}
            </article>

            <article style={cardStyle}>
              <div style={cardTitleStyle}>当前题库概览</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {questions.slice(-6).reverse().map((question) => (
                  <div
                    key={question.id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{question.stem}</div>
                    <div style={{ color: '#64748b', marginTop: 6 }}>状态：{question.status}</div>
                    <div style={{ color: '#64748b', marginTop: 4 }}>关联知识点数：{question.knowledgePointIds.length}</div>
                  </div>
                ))}
                {questions.length === 0 ? <div style={{ color: '#64748b' }}>当前还没有{subjectProfile.label}题目，先完成上面的创建流程。</div> : null}
              </div>
            </article>
          </div>
        </div>
      </section>

      {message ? <div style={{ marginTop: 20, color: '#0f766e' }}>{message}</div> : null}
      {error ? <div style={{ marginTop: 20, color: '#b91c1c' }}>{error}</div> : null}
    </main>
  );
}

function buildAnswerSchema(
  questionId: string,
  answerMode: QuestionAnswerMode,
  choiceOptions: ChoiceOption[],
  multiBlankItems: MultiBlankItem[],
) {
  switch (answerMode) {
    case 'formula_blank':
      return {
        questionId,
        mode: 'formula_blank' as const,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'latex' },
        placeholder: '请输入 LaTeX 公式，例如 \\frac{36}{6}',
      };
    case 'single_choice':
      return {
        questionId,
        mode: 'single_choice' as const,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'option_value' },
        options: choiceOptions.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          content: item.content,
        })),
        placeholder: null,
      };
    case 'multi_blank':
      return {
        questionId,
        mode: 'multi_blank' as const,
        responseShape: {
          entries: multiBlankItems.map((item) => ({
            key: item.id,
            label: item.label,
          })),
        },
        validationRules: { required: true, minEntries: multiBlankItems.length },
        gradingConfig: { compareAs: 'multi_blank_text' },
        placeholder: '请依次填写每个空位',
      };
    case 'stepwise':
      return {
        questionId,
        mode: 'stepwise' as const,
        responseShape: { steps: 'string[]' },
        validationRules: { required: true, minSteps: 1 },
        gradingConfig: { compareAs: 'stepwise_text' },
        placeholder: '每行填写一个步骤',
      };
    case 'short_answer':
      return {
        questionId,
        mode: 'short_answer' as const,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'semantic_text' },
        placeholder: '请输入你的答案',
      };
    case 'text_blank':
    default:
      return {
        questionId,
        mode: 'text_blank' as const,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'plain_text' },
        placeholder: '请输入答案',
      };
  }
}

function buildLegacyAnswer(
  answerMode: QuestionAnswerMode,
  input: {
    formulaAnswer: string;
    textAnswer: string;
    stepwiseAnswer: string;
    multiBlankItems: MultiBlankItem[];
    choiceOptions: ChoiceOption[];
    correctChoiceValue: string;
  },
) {
  switch (answerMode) {
    case 'formula_blank':
      return input.formulaAnswer;
    case 'single_choice':
      return input.correctChoiceValue;
    case 'multi_blank':
      return input.multiBlankItems.map((item) => ({
        key: item.id,
        label: item.label,
        value: item.answer,
      }));
    case 'stepwise':
      return input.stepwiseAnswer
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    case 'short_answer':
    case 'text_blank':
    default:
      return input.textAnswer;
  }
}

function resolveQuestionType(answerMode: QuestionAnswerMode): 'objective' | 'subjective' | 'stepwise' | 'oral' {
  switch (answerMode) {
    case 'short_answer':
      return 'subjective';
    case 'stepwise':
      return 'stepwise';
    default:
      return 'objective';
  }
}

function toQuestionBlocks(blocks: EditorBlock[], questionTitle: string): QuestionBlock[] {
  const mapped = blocks.map<QuestionBlock>((block) => {
    switch (block.type) {
      case 'text':
        return {
          id: block.id,
          type: 'text',
          text: block.text,
        };
      case 'math_display':
        return {
          id: block.id,
          type: 'math_display',
          latex: block.latex,
        };
      case 'image':
        return {
          id: block.id,
          type: 'image',
          url: block.url,
          caption: block.caption,
          alt: questionTitle,
        };
      case 'divider':
      default:
        return {
          id: block.id,
          type: 'divider',
        };
    }
  });

  return mapped.length > 0
    ? mapped
    : [
        {
          id: createId('fallback_block'),
          type: 'text',
          text: questionTitle,
        },
      ];
}

function createEditorBlock(type: EditorBlock['type']): EditorBlock {
  switch (type) {
    case 'math_display':
      return {
        id: createId('block'),
        type: 'math_display',
        latex: '\\frac{1}{2}',
      };
    case 'image':
      return {
        id: createId('block'),
        type: 'image',
        url: 'https://placehold.co/640x360/png',
        caption: '请替换成真实题目图片地址',
      };
    case 'divider':
      return {
        id: createId('block'),
        type: 'divider',
      };
    case 'text':
    default:
      return {
        id: createId('block'),
        type: 'text',
        text: '请输入文本题干',
      };
  }
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const sectionStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 24,
  borderRadius: 24,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.06)',
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 20,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
};

const blockCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const importRecordCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
};

const subtleTitleStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 800,
  marginTop: 12,
  marginBottom: 6,
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  marginTop: 18,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
};

const hintStyle: React.CSSProperties = {
  color: '#64748b',
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
};

const excerptStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const miniBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  color: '#475569',
  fontSize: 12,
  fontWeight: 600,
};

const headerLinkStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 14,
  background: '#0f172a',
  color: '#ffffff',
};

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 14,
  padding: '12px 16px',
  background: '#0f172a',
  color: '#ffffff',
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 14,
  padding: '10px 14px',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};

const ghostButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const ghostDangerButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  color: '#b91c1c',
  borderColor: '#fecaca',
  background: '#fef2f2',
};

const jobCardButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: 16,
  borderRadius: 16,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  textAlign: 'left',
  cursor: 'pointer',
};

function statusPillStyle(background: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background,
    color,
    fontSize: 13,
    fontWeight: 700,
  };
}

function formatImportJobStatus(status: QuestionImportJob['status']) {
  switch (status) {
    case 'pending':
      return '待执行';
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

function formatImportReviewStatus(status: QuestionImportRecord['reviewStatus']) {
  switch (status) {
    case 'approved':
      return '已通过';
    case 'rejected':
      return '已驳回';
    case 'pending':
    default:
      return '待审核';
  }
}

function getJobStatusTone(status: QuestionImportJob['status']) {
  switch (status) {
    case 'completed':
      return { background: '#ecfdf5', color: '#166534' };
    case 'failed':
      return { background: '#fef2f2', color: '#b91c1c' };
    case 'running':
      return { background: '#eff6ff', color: '#1d4ed8' };
    case 'pending':
    default:
      return { background: '#f8fafc', color: '#475569' };
  }
}

function getReviewStatusTone(status: QuestionImportRecord['reviewStatus']) {
  switch (status) {
    case 'approved':
      return { background: '#ecfdf5', color: '#166534' };
    case 'rejected':
      return { background: '#fef2f2', color: '#b91c1c' };
    case 'pending':
    default:
      return { background: '#f8fafc', color: '#475569' };
  }
}

function formatQualityLevel(level: QuestionImportRecord['qualityLevel']) {
  switch (level) {
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
    default:
      return '低';
  }
}

function getQualityTone(level: QuestionImportRecord['qualityLevel']) {
  switch (level) {
    case 'high':
      return { background: '#ecfdf5', color: '#166534' };
    case 'medium':
      return { background: '#fff7ed', color: '#c2410c' };
    case 'low':
    default:
      return { background: '#fef2f2', color: '#b91c1c' };
  }
}
