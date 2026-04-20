'use client';

import * as React from 'react';
import { apiRequest, getAuthToken } from '../../../lib/api';

type Volume = {
  id: string;
  displayName: string;
};

type KnowledgePoint = {
  id: string;
  name: string;
};

type Question = {
  id: string;
  stem: string;
  status: string;
  knowledgePointIds: string[];
};

export default function AdminContentPage() {
  const [volumes, setVolumes] = React.useState<Volume[]>([]);
  const [knowledgePoints, setKnowledgePoints] = React.useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [stem, setStem] = React.useState('36 ÷ 6 = ?');
  const [answer, setAnswer] = React.useState('6');
  const [knowledgePointName, setKnowledgePointName] = React.useState('表内除法');
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function reload() {
    try {
      setError(null);
      const [volumesResult, knowledgeResult, questionResult] = await Promise.all([
        apiRequest<Volume[]>('/textbooks'),
        apiRequest<KnowledgePoint[]>('/knowledge-points?subject=math'),
        apiRequest<Question[]>('/questions?subject=math'),
      ]);
      setVolumes(volumesResult);
      setKnowledgePoints(knowledgeResult);
      setQuestions(questionResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '内容后台加载失败');
    }
  }

  React.useEffect(() => {
    void reload();
  }, []);

  async function importTextbooks() {
    try {
      setError(null);
      const result = await apiRequest<{ importedCount: number }>(
        '/admin/textbooks/import',
        { method: 'POST', body: '{}' },
        getAuthToken(),
      );
      setMessage(`已导入 ${result.importedCount} 本数学教材`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '教材导入失败');
    }
  }

  async function createKnowledgePoint() {
    try {
      setError(null);
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
            subject: 'math',
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
      setMessage(`已创建知识点：${knowledgePointName}`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '知识点创建失败');
    }
  }

  async function createQuestion() {
    try {
      setError(null);
      const created = await apiRequest<Question>(
        '/admin/questions',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: 'math',
            type: 'objective',
            stem,
            answer,
            analysis: '先做表内除法基础运算。',
            difficultyLevel: 1,
          }),
        },
        getAuthToken(),
      );

      if (knowledgePoints[0]) {
        await apiRequest(
          `/admin/questions/${created.id}/knowledge-points`,
          {
            method: 'POST',
            body: JSON.stringify({
              knowledgePointIds: [knowledgePoints[0].id],
            }),
          },
          getAuthToken(),
        );
        await apiRequest(`/admin/questions/${created.id}/publish`, { method: 'PATCH' }, getAuthToken());
      }

      setMessage(`已创建并发布题目：${stem}`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '题目创建失败');
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 1080 }}>
      <h1>内容后台</h1>
      <p style={{ color: '#475569' }}>请用包含 admin 的账号登录后再使用这里的接口。</p>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 24 }}>
        <section style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
          <h2>1. 导入数学教材</h2>
          <button onClick={importTextbooks}>导入教材</button>
          <div style={{ marginTop: 12 }}>已导入册次：{volumes.length}</div>
        </section>

        <section style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
          <h2>2. 创建知识点</h2>
          <input value={knowledgePointName} onChange={(event) => setKnowledgePointName(event.target.value)} />
          <button onClick={createKnowledgePoint} style={{ marginTop: 12 }}>
            创建知识点
          </button>
          <div style={{ marginTop: 12 }}>知识点数量：{knowledgePoints.length}</div>
        </section>

        <section style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
          <h2>3. 创建并发布题目</h2>
          <input value={stem} onChange={(event) => setStem(event.target.value)} />
          <input value={answer} onChange={(event) => setAnswer(event.target.value)} style={{ marginTop: 12 }} />
          <button onClick={createQuestion} style={{ marginTop: 12 }}>
            创建题目
          </button>
          <div style={{ marginTop: 12 }}>题目数量：{questions.length}</div>
        </section>
      </div>

      {message ? <div style={{ marginTop: 20, color: '#0f766e' }}>{message}</div> : null}
      {error ? <div style={{ marginTop: 20, color: '#b91c1c' }}>{error}</div> : null}
    </main>
  );
}
