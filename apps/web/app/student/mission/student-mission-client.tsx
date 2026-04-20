'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { AssistantWidget } from '../../../components/assistant-widget';
import { apiRequest, getAuthToken } from '../../../lib/api';

type AssessmentSession = {
  id: string;
  itemIds: string[];
};

type AssessmentResult = {
  sessionId: string;
  overallScore: number;
  parentSummary: string;
};

type Mission = {
  id: string;
  title: string;
  questionIds: string[];
  studentSummary: string;
  status: string;
};

type Question = {
  id: string;
  stem: string;
};

export function StudentMissionClient() {
  const params = useSearchParams();
  const studentId = params.get('studentId');

  const [assessment, setAssessment] = React.useState<AssessmentSession | null>(null);
  const [assessmentResult, setAssessmentResult] = React.useState<AssessmentResult | null>(null);
  const [mission, setMission] = React.useState<Mission | null>(null);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [currentAnswer, setCurrentAnswer] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [hint, setHint] = React.useState<string | null>(null);

  function applyError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : '当前操作失败，请稍后重试');
  }

  async function loadQuestionBank() {
    try {
      setError(null);
      const questionBank = await apiRequest<Question[]>('/questions?subject=math');
      setQuestions(questionBank);
    } catch (caught) {
      applyError(caught);
    }
  }

  React.useEffect(() => {
    void loadQuestionBank();
  }, []);

  async function startAssessment() {
    if (!studentId) {
      return;
    }

    try {
      setError(null);
      const session = await apiRequest<AssessmentSession>(
        '/assessments/start',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId,
            subject: 'math',
            assessmentType: 'initial',
          }),
        },
        getAuthToken(),
      );
      setAssessment(session);
      setAssessmentResult(null);
      setCurrentIndex(0);
      setFeedback(null);
    } catch (caught) {
      applyError(caught);
    }
  }

  async function submitAssessmentAnswer() {
    if (!assessment) {
      return;
    }

    try {
      setError(null);
      const itemId = assessment.itemIds[currentIndex];
      const response = await apiRequest<{ analysis: string; correct: boolean }>(
        `/assessments/${assessment.id}/answers`,
        {
          method: 'POST',
          body: JSON.stringify({
            itemId,
            answer: currentAnswer,
            elapsedMs: 3000,
          }),
        },
        getAuthToken(),
      );
      setFeedback(response.analysis);
      setCurrentAnswer('');

      if (currentIndex === assessment.itemIds.length - 1) {
        const result = await apiRequest<AssessmentResult>(
          `/assessments/${assessment.id}/complete`,
          { method: 'POST' },
          getAuthToken(),
        );
        setAssessmentResult(result);
        setAssessment(null);
      } else {
        setCurrentIndex((value) => value + 1);
      }
    } catch (caught) {
      applyError(caught);
    }
  }

  async function loadMission() {
    if (!studentId) {
      return;
    }

    try {
      setError(null);
      const todayMission = await apiRequest<Mission>(
        `/missions/today?studentId=${studentId}&subject=math`,
        {},
        getAuthToken(),
      );
      setMission(todayMission);
      setCurrentIndex(0);
      setFeedback(todayMission.studentSummary);
      setHint(null);
      await apiRequest(`/missions/${todayMission.id}/start`, { method: 'POST' }, getAuthToken());
    } catch (caught) {
      applyError(caught);
    }
  }

  async function submitMissionAnswer() {
    if (!mission) {
      return;
    }

    try {
      setError(null);
      const itemId = mission.questionIds[currentIndex];
      const response = await apiRequest<{ analysis: string; recoverySuggested: boolean }>(
        `/missions/${mission.id}/answers`,
        {
          method: 'POST',
          body: JSON.stringify({
            itemId,
            answer: currentAnswer,
            elapsedMs: 3000,
          }),
        },
        getAuthToken(),
      );
      setFeedback(response.analysis);
      setCurrentAnswer('');

      if (currentIndex === mission.questionIds.length - 1) {
        const completed = await apiRequest<{ summary: string }>(
          `/missions/${mission.id}/complete`,
          { method: 'POST' },
          getAuthToken(),
        );
        setFeedback(completed.summary);
        setMission(null);
      } else {
        setCurrentIndex((value) => value + 1);
      }
    } catch (caught) {
      applyError(caught);
    }
  }

  async function requestHint() {
    if (!mission) {
      return;
    }
    try {
      setError(null);
      const itemId = mission.questionIds[currentIndex];
      const response = await apiRequest<{ hint: string }>(
        `/missions/${mission.id}/hints`,
        {
          method: 'POST',
          body: JSON.stringify({
            itemId,
          }),
        },
        getAuthToken(),
      );
      setHint(response.hint);
    } catch (caught) {
      setHint(null);
      applyError(caught);
    }
  }

  const currentAssessmentQuestion = assessment ? questions.find((item) => item.id === assessment.itemIds[currentIndex]) : null;
  const currentMissionQuestion = mission ? questions.find((item) => item.id === mission.questionIds[currentIndex]) : null;

  return (
    <main style={{ padding: 40, maxWidth: 920 }}>
      <h1>学生任务页</h1>
      <p style={{ color: '#475569' }}>这里串起入门评估、今日任务和悬浮助教，是首轮数学闭环的核心页面。</p>

      <section style={{ marginTop: 24, padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
        <h2>入门评估</h2>
        {!assessment && !assessmentResult ? <button onClick={startAssessment}>开始入门评估</button> : null}

        {assessment && currentAssessmentQuestion ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>题目：{currentAssessmentQuestion.stem}</div>
            <input value={currentAnswer} onChange={(event) => setCurrentAnswer(event.target.value)} placeholder="输入答案" />
            <button onClick={submitAssessmentAnswer}>提交这一题</button>
          </div>
        ) : null}

        {assessmentResult ? (
          <div style={{ marginTop: 12 }}>
            <div>评估分数：{assessmentResult.overallScore}</div>
            <div>{assessmentResult.parentSummary}</div>
            <button onClick={loadMission} style={{ marginTop: 12 }}>
              进入今日任务
            </button>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 24, padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
        <h2>今日任务</h2>
        {!mission ? <button onClick={loadMission}>生成今日任务</button> : null}

        {mission && currentMissionQuestion ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>{mission.title}</div>
            <div>题目：{currentMissionQuestion.stem}</div>
            <input value={currentAnswer} onChange={(event) => setCurrentAnswer(event.target.value)} placeholder="输入答案" />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={submitMissionAnswer}>提交当前题目</button>
              <button onClick={requestHint}>请求提示</button>
            </div>
            {hint ? <div style={{ color: '#0f766e' }}>提示：{hint}</div> : null}
          </div>
        ) : null}
      </section>

      {feedback ? (
        <section style={{ marginTop: 24, padding: 20, borderRadius: 20, background: '#ecfeff', border: '1px solid #99f6e4' }}>
          <strong>反馈：</strong> {feedback}
        </section>
      ) : null}

      {error ? (
        <section style={{ marginTop: 24, padding: 20, borderRadius: 20, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
          <strong>错误：</strong> {error}
        </section>
      ) : null}

      <AssistantWidget
        userRole="student"
        studentId={studentId}
        pageContext="mission"
        title="数学助教"
        subtitle="问我：这道题先做哪一步"
      />
    </main>
  );
}
