'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, getAuthToken, getCurrentUser } from '../../../lib/api';

type User = {
  id: string;
  role: string;
  displayName: string;
};

type AnalyticsOverview = {
  studentCount: number;
  activeParentCount: number;
  textbookVolumeCount: number;
  knowledgePointCount: number;
  publishedQuestionCount: number;
  completedAssessmentCount: number;
  completedMissionCount: number;
  activeStudyPlanCount: number;
  aiInsightCount: number;
};

type AIQualityOverview = {
  totalInsightCount: number;
  sourceBreakdown: {
    assessment: number;
    hint: number;
    assistant: number;
  };
  confidenceBreakdown: {
    low: number;
    medium: number;
    high: number;
  };
  reviewRequiredCount: number;
  searchBackedAssistantCount: number;
  searchBackedAssistantRate: number;
  recentInsights: Array<{
    id: string;
    sourceType: 'assessment' | 'hint' | 'assistant';
    studentId: string | null;
    summary: string;
    confidenceLevel: 'low' | 'medium' | 'high';
    reviewRequired: boolean;
    searchResultCount: number;
    createdAt: string;
  }>;
};

const panelStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 20,
  background: '#fff',
  border: '1px solid #e2e8f0',
};

function getConfidenceStyle(level: AIQualityOverview['recentInsights'][number]['confidenceLevel']) {
  switch (level) {
    case 'high':
      return { background: '#dcfce7', color: '#166534' };
    case 'medium':
      return { background: '#fef3c7', color: '#92400e' };
    case 'low':
    default:
      return { background: '#fee2e2', color: '#b91c1c' };
  }
}

function getSourceLabel(sourceType: AIQualityOverview['recentInsights'][number]['sourceType']) {
  switch (sourceType) {
    case 'assessment':
      return '评估分析';
    case 'hint':
      return '提示生成';
    case 'assistant':
    default:
      return '助教对话';
  }
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [aiQuality, setAiQuality] = React.useState<AIQualityOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  async function loadData() {
    try {
      setError(null);
      setLoading(true);
      const currentUser = getCurrentUser<User>();
      if (!currentUser) {
        router.push('/parent/login');
        return;
      }

      if (currentUser.role !== 'admin') {
        setError('当前账号不是管理员，无法查看运营看板。');
        setLoading(false);
        return;
      }

      const [overviewResult, aiQualityResult] = await Promise.all([
        apiRequest<AnalyticsOverview>('/admin/analytics/overview', {}, getAuthToken()),
        apiRequest<AIQualityOverview>('/admin/analytics/ai-quality', {}, getAuthToken()),
      ]);
      setOverview(overviewResult);
      setAiQuality(aiQualityResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '运营看板加载失败');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadData();
  }, []);

  return (
    <main style={{ padding: 40, maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h1>运营看板</h1>
          <p style={{ color: '#475569', lineHeight: 1.7 }}>
            这里查看内容供给、训练完成度和 AI 使用质量，方便判断系统当前是否在稳定输出学习价值。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/admin/content"
            style={{ padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #cbd5e1', color: '#0f172a' }}
          >
            进入内容后台
          </Link>
          <button
            onClick={() => void loadData()}
            style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: '#0f766e', color: '#fff' }}
          >
            刷新指标
          </button>
        </div>
      </div>

      {error ? (
        <section style={{ ...panelStyle, marginTop: 24, color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }}>
          {error}
        </section>
      ) : null}

      {loading ? (
        <section style={{ ...panelStyle, marginTop: 24, color: '#475569' }}>正在读取运营指标...</section>
      ) : null}

      {overview ? (
        <section style={{ marginTop: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: '学生数', value: overview.studentCount },
            { label: '活跃家长', value: overview.activeParentCount },
            { label: '教材册次', value: overview.textbookVolumeCount },
            { label: '知识点', value: overview.knowledgePointCount },
            { label: '已发布题目', value: overview.publishedQuestionCount },
            { label: '完成评估', value: overview.completedAssessmentCount },
            { label: '完成任务', value: overview.completedMissionCount },
            { label: '活跃周计划', value: overview.activeStudyPlanCount },
            { label: 'AI 洞察总数', value: overview.aiInsightCount },
          ].map((item) => (
            <div key={item.label} style={panelStyle}>
              <div style={{ fontSize: 12, color: '#64748b' }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </section>
      ) : null}

      {aiQuality ? (
        <section style={{ marginTop: 28, display: 'grid', gap: 20 }}>
          <div style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>AI 质量概览</h2>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 16 }}>
              {[
                { label: '评估分析洞察', value: aiQuality.sourceBreakdown.assessment },
                { label: '提示生成洞察', value: aiQuality.sourceBreakdown.hint },
                { label: '助教对话洞察', value: aiQuality.sourceBreakdown.assistant },
                { label: '需人工复核', value: aiQuality.reviewRequiredCount },
                { label: '带检索支撑的助教回复', value: aiQuality.searchBackedAssistantCount },
                { label: '助教检索覆盖率', value: `${aiQuality.searchBackedAssistantRate}%` },
              ].map((item) => (
                <div key={item.label} style={{ padding: 14, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{item.label}</div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 20 }}>
              <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700 }}>置信度分布</div>
                <div style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
                  高置信：{aiQuality.confidenceBreakdown.high}
                  <br />
                  中置信：{aiQuality.confidenceBreakdown.medium}
                  <br />
                  低置信：{aiQuality.confidenceBreakdown.low}
                </div>
              </div>
              <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700 }}>当前判断</div>
                <div style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
                  {aiQuality.totalInsightCount === 0
                    ? '当前还没有形成足够的 AI 洞察数据，建议先完成几轮真实评估、提示和助教交互。'
                    : aiQuality.searchBackedAssistantRate >= 80
                      ? '助教回复的检索支撑覆盖比较稳，当前更值得关注低置信或需复核的场景。'
                      : '助教回复已开始稳定使用检索，但还需要继续观察是否每次关键对话都带足上下文支撑。'}
                </div>
              </div>
            </div>
          </div>

          <div style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>最近 AI 洞察</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {aiQuality.recentInsights.length > 0 ? (
                aiQuality.recentInsights.map((insight) => (
                  <div
                    key={insight.id}
                    style={{ padding: 16, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 10 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{getSourceLabel(insight.sourceType)}</strong>
                        <span style={{ ...getConfidenceStyle(insight.confidenceLevel), padding: '4px 8px', borderRadius: 999, fontSize: 12 }}>
                          {insight.confidenceLevel === 'high' ? '高置信' : insight.confidenceLevel === 'medium' ? '中置信' : '低置信'}
                        </span>
                        {insight.reviewRequired ? (
                          <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 12, background: '#fee2e2', color: '#b91c1c' }}>
                            需复核
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{new Date(insight.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                    <div style={{ color: '#0f172a', lineHeight: 1.7 }}>{insight.summary}</div>
                    <div style={{ color: '#475569', fontSize: 13 }}>
                      学生：{insight.studentId ?? '未绑定'} | 检索命中：{insight.searchResultCount} 条
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b' }}>当前还没有 AI 洞察记录。</div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
