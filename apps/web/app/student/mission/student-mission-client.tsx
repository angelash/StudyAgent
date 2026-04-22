'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  AssessmentProgressView,
  AssessmentResult,
  AssessmentSession,
  DailyMission,
  MissionResultView,
  QuestionRenderPayload,
  StudentAnswerPayload,
  Subject,
} from '@study-agent/contracts';
import { AssistantWidget } from '../../../components/assistant-widget';
import { QuestionRenderer, createEmptyAnswerPayload } from '../../../components/question-renderer';
import { apiRequest, getAuthToken } from '../../../lib/api';

type MissionView = DailyMission & {
  studentSummary: string;
};

const subjectMeta: Record<Subject, { label: string; assistantTitle: string; assistantSubtitle: string }> = {
  chinese: {
    label: '语文',
    assistantTitle: '语文助教',
    assistantSubtitle: '问我：这道阅读题先抓什么信息',
  },
  math: {
    label: '数学',
    assistantTitle: '数学助教',
    assistantSubtitle: '问我：这道题先做哪一步',
  },
  english: {
    label: '英语',
    assistantTitle: '英语助教',
    assistantSubtitle: '问我：这句该先看哪个关键词',
  },
};

function parseSubject(value: string | null): Subject {
  return value === 'chinese' || value === 'english' || value === 'math' ? value : 'math';
}

export function StudentMissionClient() {
  const router = useRouter();
  const params = useSearchParams();
  const studentId = params.get('studentId');
  const subject = parseSubject(params.get('subject'));

  const [assessment, setAssessment] = React.useState<AssessmentSession | null>(null);
  const [assessmentProgress, setAssessmentProgress] = React.useState<AssessmentProgressView | null>(null);
  const [assessmentResult, setAssessmentResult] = React.useState<AssessmentResult | null>(null);
  const [assessmentQuestion, setAssessmentQuestion] = React.useState<QuestionRenderPayload | null>(null);
  const [assessmentAnswer, setAssessmentAnswer] = React.useState<StudentAnswerPayload | null>(null);

  const [mission, setMission] = React.useState<MissionView | null>(null);
  const [missionResult, setMissionResult] = React.useState<MissionResultView | null>(null);
  const [missionQuestion, setMissionQuestion] = React.useState<QuestionRenderPayload | null>(null);
  const [missionAnswer, setMissionAnswer] = React.useState<StudentAnswerPayload | null>(null);

  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [hint, setHint] = React.useState<string | null>(null);

  function applyError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : '当前操作失败，请稍后重试');
  }

  React.useEffect(() => {
    setAssessment(null);
    setAssessmentProgress(null);
    setAssessmentResult(null);
    setAssessmentQuestion(null);
    setAssessmentAnswer(null);
    setMission(null);
    setMissionResult(null);
    setMissionQuestion(null);
    setMissionAnswer(null);
    setFeedback(null);
    setHint(null);
    setError(null);
    setCurrentIndex(0);
  }, [subject]);

  React.useEffect(() => {
    const itemId = assessment?.itemIds[currentIndex];
    if (!itemId) {
      setAssessmentQuestion(null);
      setAssessmentAnswer(null);
      return;
    }

    let cancelled = false;
    void apiRequest<QuestionRenderPayload>(`/questions/${itemId}/render`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAssessmentQuestion(payload);
        setAssessmentAnswer(createEmptyAnswerPayload(payload));
      })
      .catch((caught) => {
        if (!cancelled) {
          applyError(caught);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assessment, currentIndex]);

  React.useEffect(() => {
    const itemId = mission?.questionIds[currentIndex];
    if (!itemId) {
      setMissionQuestion(null);
      setMissionAnswer(null);
      return;
    }

    let cancelled = false;
    void apiRequest<QuestionRenderPayload>(`/questions/${itemId}/render`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setMissionQuestion(payload);
        setMissionAnswer(createEmptyAnswerPayload(payload));
      })
      .catch((caught) => {
        if (!cancelled) {
          applyError(caught);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mission, currentIndex]);

  async function loadAssessmentProgress(sessionId: string) {
    const progress = await apiRequest<AssessmentProgressView>(`/assessments/${sessionId}/progress`, {}, getAuthToken());
    setAssessmentProgress(progress);
    setCurrentIndex(progress.currentIndex);
    return progress;
  }

  async function loadMissionResult(missionId: string) {
    const result = await apiRequest<MissionResultView>(`/missions/${missionId}/result`, {}, getAuthToken());
    setMissionResult(result);
    return result;
  }

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
            subject,
            assessmentType: 'initial',
          }),
        },
        getAuthToken(),
      );
      setAssessment(session);
      await loadAssessmentProgress(session.id);
      setAssessmentResult(null);
      setMissionResult(null);
      setCurrentIndex(0);
      setFeedback(null);
      setHint(null);
    } catch (caught) {
      applyError(caught);
    }
  }

  async function submitAssessmentAnswer() {
    if (!assessment || !assessmentAnswer) {
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
            answer: assessmentAnswer,
            elapsedMs: 3000,
          }),
        },
        getAuthToken(),
      );
      setFeedback(response.analysis);

      if (currentIndex === assessment.itemIds.length - 1) {
        await apiRequest<AssessmentResult>(
          `/assessments/${assessment.id}/complete`,
          { method: 'POST' },
          getAuthToken(),
        );
        const result = await apiRequest<AssessmentResult>(
          `/assessments/${assessment.id}/result`,
          {},
          getAuthToken(),
        );
        setAssessmentResult(result);
        setAssessment(null);
        setAssessmentProgress(null);
      } else {
        await loadAssessmentProgress(assessment.id);
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
      const todayMission = await apiRequest<MissionView>(
        `/missions/today?studentId=${studentId}&subject=${subject}`,
        {},
        getAuthToken(),
      );
      setMission(todayMission);
      setMissionResult(null);
      setCurrentIndex(0);
      setFeedback(todayMission.studentSummary);
      setHint(null);
      await apiRequest(`/missions/${todayMission.id}/start`, { method: 'POST' }, getAuthToken());
    } catch (caught) {
      applyError(caught);
    }
  }

  async function submitMissionAnswer() {
    if (!mission || !missionAnswer) {
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
            answer: missionAnswer,
            elapsedMs: 3000,
          }),
        },
        getAuthToken(),
      );
      setFeedback(response.analysis);

      if (currentIndex === mission.questionIds.length - 1) {
        await apiRequest<{ summary: string }>(
          `/missions/${mission.id}/complete`,
          { method: 'POST' },
          getAuthToken(),
        );
        const result = await loadMissionResult(mission.id);
        setFeedback(result.summary);
        setMission(null);
        setMissionQuestion(null);
        setMissionAnswer(null);
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

  return (
    <main style={{ padding: 40, maxWidth: 980 }}>
      <h1>学生任务页</h1>
      <p style={{ color: '#475569', lineHeight: 1.8 }}>
        这里串起{subjectMeta[subject].label}入门评估、今日任务和悬浮助教，同时已经接入题目运行时渲染协议，可展示结构化题目、公式块和多种作答模式。
      </p>

      <section style={sectionStyle}>
        <h2>当前学科</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {(Object.keys(subjectMeta) as Subject[]).map((item) => (
            <button
              key={item}
              onClick={() => router.push(`/student/mission?studentId=${studentId ?? ''}&subject=${item}`)}
              style={{
                border: `1px solid ${subject === item ? '#0f766e' : '#cbd5e1'}`,
                borderRadius: 999,
                padding: '10px 14px',
                background: subject === item ? '#ecfdf5' : '#ffffff',
                color: subject === item ? '#065f46' : '#0f172a',
                cursor: 'pointer',
              }}
            >
              {subjectMeta[item].label}
            </button>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2>{subjectMeta[subject].label}入门评估</h2>
        {!assessment && !assessmentResult ? <button onClick={startAssessment}>开始入门评估</button> : null}

        {assessment && assessmentQuestion && assessmentAnswer ? (
          <div style={{ display: 'grid', gap: 16 }}>
            {assessmentProgress ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={metaStyle}>
                  已完成 {assessmentProgress.answeredCount} / {assessmentProgress.totalCount} 题
                </div>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${assessmentProgress.progressPercent}%` }} />
                </div>
              </div>
            ) : null}
            <div style={metaStyle}>
              第 {currentIndex + 1} / {assessment.itemIds.length} 题
            </div>
            <QuestionRenderer
              renderPayload={assessmentQuestion}
              answer={assessmentAnswer}
              onChange={setAssessmentAnswer}
            />
            <button onClick={submitAssessmentAnswer}>提交这一题</button>
          </div>
        ) : null}

        {assessmentResult ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            <div style={{ fontWeight: 700 }}>评估分数：{assessmentResult.overallScore}</div>
            <div style={{ color: '#334155', lineHeight: 1.7 }}>{assessmentResult.parentSummary}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {assessmentResult.knowledgeResults.map((item) => (
                <div key={item.knowledgePointId} style={resultCardStyle}>
                  <div style={{ fontWeight: 700 }}>{item.knowledgePointName}</div>
                  <div style={{ color: '#475569', marginTop: 4 }}>
                    得分 {item.score}，答对 {item.correctCount} / {item.totalCount}
                  </div>
                  {item.errorTypes.length > 0 ? (
                    <div style={{ color: '#64748b', marginTop: 4 }}>错因：{item.errorTypes.join('、')}</div>
                  ) : null}
                </div>
              ))}
            </div>
            {assessmentResult.recommendedActions.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <strong>下一步建议</strong>
                {assessmentResult.recommendedActions.map((item) => (
                  <div key={item} style={{ color: '#475569' }}>
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
            <button onClick={loadMission} style={{ marginTop: 12 }}>
              进入今日任务
            </button>
          </div>
        ) : null}
      </section>

      <section style={sectionStyle}>
        <h2>{subjectMeta[subject].label}今日任务</h2>
        {!mission && !missionResult ? <button onClick={loadMission}>生成今日任务</button> : null}

        {mission && missionQuestion && missionAnswer ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{mission.title}</div>
              <div style={metaStyle}>
                第 {currentIndex + 1} / {mission.questionIds.length} 题
              </div>
            </div>
            <QuestionRenderer renderPayload={missionQuestion} answer={missionAnswer} onChange={setMissionAnswer} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={submitMissionAnswer}>提交当前题目</button>
              <button onClick={requestHint}>请求提示</button>
            </div>
            {hint ? <div style={{ color: '#0f766e' }}>提示：{hint}</div> : null}
          </div>
        ) : null}

        {missionResult ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontWeight: 700 }}>{missionResult.title}</div>
            <div style={{ color: '#334155', lineHeight: 1.7 }}>{missionResult.summary}</div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div style={resultCardStyle}>正确 {missionResult.correctCount} / {missionResult.totalCount}</div>
              <div style={resultCardStyle}>提示使用 {missionResult.hintUsedCount} 题</div>
              <div style={resultCardStyle}>总尝试次数 {missionResult.totalAttempts}</div>
            </div>
            {missionResult.targetKnowledgePointNames.length > 0 ? (
              <div style={{ color: '#475569' }}>本次聚焦：{missionResult.targetKnowledgePointNames.join('、')}</div>
            ) : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {missionResult.itemResults.map((item) => (
                <div key={item.questionId} style={resultCardStyle}>
                  <div style={{ fontWeight: 700 }}>{item.questionStem}</div>
                  <div style={{ color: item.correct ? '#166534' : '#b91c1c', marginTop: 6 }}>
                    {item.correct ? '已完成' : '仍需巩固'}
                  </div>
                  <div style={{ color: '#475569', marginTop: 4 }}>
                    尝试 {item.attemptCount} 次，提示等级 {item.hintLevelUsed}
                  </div>
                  <div style={{ color: '#64748b', marginTop: 4 }}>{item.analysis}</div>
                </div>
              ))}
            </div>
            {missionResult.nextActions.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <strong>下一步建议</strong>
                {missionResult.nextActions.map((item) => (
                  <div key={item} style={{ color: '#475569' }}>
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
            <button onClick={loadMission}>继续下一轮任务</button>
          </div>
        ) : null}
      </section>

      {feedback ? (
        <section style={{ ...sectionStyle, background: '#ecfeff', borderColor: '#99f6e4' }}>
          <strong>反馈：</strong> {feedback}
        </section>
      ) : null}

      {error ? (
        <section style={{ ...sectionStyle, background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <strong>错误：</strong> {error}
        </section>
      ) : null}

      <AssistantWidget
        userRole="student"
        studentId={studentId}
        subject={subject}
        pageContext="mission"
        title={subjectMeta[subject].assistantTitle}
        subtitle={subjectMeta[subject].assistantSubtitle}
      />
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 20,
  borderRadius: 20,
  background: '#fff',
  border: '1px solid #e2e8f0',
};

const metaStyle: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '6px 10px',
  borderRadius: 999,
  background: '#e0f2fe',
  color: '#0f172a',
  fontSize: 13,
};

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 10,
  borderRadius: 999,
  background: '#e2e8f0',
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: '#0f766e',
};

const resultCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  border: '1px solid #dbeafe',
  background: '#f8fafc',
};
