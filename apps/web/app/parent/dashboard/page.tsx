'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Subject } from '@study-agent/contracts';
import { AssistantWidget } from '../../../components/assistant-widget';
import { apiRequest, getAuthToken, getCurrentUser } from '../../../lib/api';

type User = {
  id: string;
  role: string;
  displayName: string;
};

type ChildProfile = {
  id: string;
  nickname: string;
  grade: number;
  preferredSessionMinutes: number;
  enrollments: Array<{ subject: Subject; enabled: boolean; textbookVersionId: string }>;
};

type Volume = {
  id: string;
  subject: Subject;
  displayName: string;
  grade: number;
};

type MasteryStatus = 'unknown' | 'learning' | 'unstable' | 'mastered' | 'at_risk';

type WeeklyReport = {
  studentId: string;
  subject: Subject;
  weekStartDate: string;
  weekEndDate: string;
  assessmentCount: number;
  missionCompletedCount: number;
  totalAnsweredCount: number;
  correctRate: number;
  hintUsedCount: number;
  highlights: string[];
  strongestKnowledgePoints: Array<{
    knowledgePointId: string;
    knowledgePointName: string;
    masteryScore: number;
    status: MasteryStatus;
  }>;
  focusKnowledgePoints: Array<{
    knowledgePointId: string;
    knowledgePointName: string;
    masteryScore: number;
    status: MasteryStatus;
  }>;
  masterySnapshots: Array<{
    knowledgePointId: string;
    knowledgePointName: string;
    masteryScore: number;
    confidenceScore: number;
    status: MasteryStatus;
  }>;
  parentSummary: string;
};

type RiskSignal = {
  id: string;
  type: 'streak_break' | 'retry_failure' | 'mastery_drop' | 'high_hint_dependency';
  level: 'low' | 'medium' | 'high';
  summary: string;
  action: string;
  knowledgePointName: string | null;
};

type StudyPlan = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  availableMinutesPerDay: number;
  goals: string[];
  requiredKnowledgePointNames: string[];
  summary: string;
  dailyPlans: Array<{
    date: string;
    weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    missionType: 'new_learning' | 'practice' | 'retry' | 'review';
    estimatedMinutes: number;
    focusKnowledgePointNames: string[];
    goal: string;
  }>;
};

const subjectMeta: Record<Subject, { label: string; missionLabel: string; defaultVersionId: string }> = {
  chinese: {
    label: '语文',
    missionLabel: '语文任务',
    defaultVersionId: 'chinese-dev-version',
  },
  math: {
    label: '数学',
    missionLabel: '数学任务',
    defaultVersionId: 'math-dev-version',
  },
  english: {
    label: '英语',
    missionLabel: '英语任务',
    defaultVersionId: 'english-dev-version',
  },
};

const sectionStyle: React.CSSProperties = {
  marginTop: 28,
  padding: 20,
  borderRadius: 20,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
};

function getStatusLabel(status: MasteryStatus) {
  switch (status) {
    case 'mastered':
      return '已掌握';
    case 'unstable':
      return '待稳固';
    case 'learning':
      return '学习中';
    case 'at_risk':
      return '需关注';
    case 'unknown':
    default:
      return '待观察';
  }
}

function getStatusStyle(status: MasteryStatus): React.CSSProperties {
  switch (status) {
    case 'mastered':
      return { background: '#dcfce7', color: '#166534' };
    case 'unstable':
      return { background: '#fef3c7', color: '#92400e' };
    case 'learning':
      return { background: '#dbeafe', color: '#1d4ed8' };
    case 'at_risk':
      return { background: '#fee2e2', color: '#b91c1c' };
    case 'unknown':
    default:
      return { background: '#e2e8f0', color: '#334155' };
  }
}

function getRiskStyle(level: RiskSignal['level']): React.CSSProperties {
  switch (level) {
    case 'high':
      return { background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' };
    case 'medium':
      return { background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' };
    case 'low':
    default:
      return { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' };
  }
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [childrenProfiles, setChildrenProfiles] = React.useState<ChildProfile[]>([]);
  const [volumes, setVolumes] = React.useState<Volume[]>([]);
  const [selectedSubject, setSelectedSubject] = React.useState<Subject>('math');
  const [reportsByStudent, setReportsByStudent] = React.useState<Record<string, WeeklyReport>>({});
  const [alertsByStudent, setAlertsByStudent] = React.useState<Record<string, RiskSignal[]>>({});
  const [plansByStudent, setPlansByStudent] = React.useState<Record<string, StudyPlan>>({});
  const [nickname, setNickname] = React.useState('小明');
  const [grade, setGrade] = React.useState(3);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = React.useState(false);
  const [regeneratingPlanStudentId, setRegeneratingPlanStudentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function bootstrap() {
      try {
        setError(null);
        const currentUser = getCurrentUser<User>();
        if (!currentUser) {
          router.push('/parent/login');
          return;
        }

        setUser(currentUser);
        const [childrenResult, volumesResult] = await Promise.all([
          apiRequest<ChildProfile[]>(`/parents/${currentUser.id}/students`, {}, getAuthToken()),
          apiRequest<Volume[]>('/textbooks', {}),
        ]);
        setChildrenProfiles(childrenResult);
        setVolumes(volumesResult);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '家长控制台加载失败');
      }
    }

    void bootstrap();
  }, [router]);

  React.useEffect(() => {
    if (!user) {
      return;
    }

    void loadStudentInsights(user.id, childrenProfiles, selectedSubject);
  }, [childrenProfiles, selectedSubject, user]);

  async function loadStudentInsights(parentId: string, children: ChildProfile[], subject: Subject) {
    if (children.length === 0) {
      setReportsByStudent({});
      setAlertsByStudent({});
      setPlansByStudent({});
      return;
    }

    setLoadingInsights(true);
    try {
      const settled = await Promise.allSettled(
        children.map(async (child) => {
          const [report, alerts, plan] = await Promise.all([
            apiRequest<WeeklyReport>(`/reports/weekly?studentId=${child.id}&subject=${subject}`, {}, getAuthToken()),
            apiRequest<RiskSignal[]>(`/parents/${parentId}/alerts?studentId=${child.id}&subject=${subject}`, {}, getAuthToken()),
            apiRequest<StudyPlan>(`/plans/weekly?studentId=${child.id}&subject=${subject}`, {}, getAuthToken()),
          ]);

          return {
            studentId: child.id,
            report,
            alerts,
            plan,
          };
        }),
      );

      const nextReports: Record<string, WeeklyReport> = {};
      const nextAlerts: Record<string, RiskSignal[]> = {};
      const nextPlans: Record<string, StudyPlan> = {};

      for (const result of settled) {
        if (result.status !== 'fulfilled') {
          continue;
        }

        nextReports[result.value.studentId] = result.value.report;
        nextAlerts[result.value.studentId] = result.value.alerts;
        nextPlans[result.value.studentId] = result.value.plan;
      }

      setReportsByStudent(nextReports);
      setAlertsByStudent(nextAlerts);
      setPlansByStudent(nextPlans);
    } finally {
      setLoadingInsights(false);
    }
  }

  async function regeneratePlan(child: ChildProfile) {
    if (!user) {
      return;
    }

    try {
      setError(null);
      setRegeneratingPlanStudentId(child.id);
      await apiRequest<StudyPlan>(
        '/plans/weekly/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: child.id,
            subject: selectedSubject,
            availableMinutesPerDay: child.preferredSessionMinutes,
          }),
        },
        getAuthToken(),
      );
      await loadStudentInsights(user.id, childrenProfiles, selectedSubject);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重建本周计划失败');
    } finally {
      setRegeneratingPlanStudentId(null);
    }
  }

  function pickDefaultVolumeId(subject: Subject, gradeValue: number) {
    const exactMatch = volumes.find((item) => item.subject === subject && item.grade === gradeValue);
    if (exactMatch) {
      return exactMatch.id;
    }

    const fallback = volumes.find((item) => item.subject === subject);
    return fallback?.id ?? subjectMeta[subject].defaultVersionId;
  }

  async function createStudent() {
    if (!user) {
      return;
    }

    try {
      setError(null);
      setMessage(null);
      const created = await apiRequest<{ profile: ChildProfile }>(
        '/students',
        {
          method: 'POST',
          body: JSON.stringify({
            nickname,
            grade,
            preferredSessionMinutes: 20,
            defaultVersionMap: {
              chinese: pickDefaultVolumeId('chinese', grade),
              math: pickDefaultVolumeId('math', grade),
              english: pickDefaultVolumeId('english', grade),
            },
          }),
        },
        getAuthToken(),
      );

      const nextChildren = [...childrenProfiles, created.profile];
      setChildrenProfiles(nextChildren);
      setMessage(`已创建学生档案：${created.profile.nickname}`);
      await loadStudentInsights(user.id, nextChildren, selectedSubject);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建学生档案失败');
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 980 }}>
      <h1>家长控制台</h1>
      <p style={{ color: '#475569' }}>
        这里不仅能建学生档案，也能按语文、数学、英语查看孩子这一周的学习状态、风险提醒和重点陪伴方向。
      </p>

      <section style={sectionStyle}>
        <h2>当前查看学科</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {(Object.keys(subjectMeta) as Subject[]).map((subject) => (
            <button
              key={subject}
              onClick={() => setSelectedSubject(subject)}
              style={{
                border: `1px solid ${selectedSubject === subject ? '#0f766e' : '#cbd5e1'}`,
                borderRadius: 999,
                padding: '10px 14px',
                background: selectedSubject === subject ? '#ecfdf5' : '#ffffff',
                color: selectedSubject === subject ? '#065f46' : '#0f172a',
                cursor: 'pointer',
              }}
            >
              {subjectMeta[subject].label}
            </button>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2>创建学生档案</h2>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="学生昵称" />
          <input
            type="number"
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
            placeholder="年级"
          />
          <button
            onClick={createStudent}
            style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: '#0f766e', color: '#fff' }}
          >
            创建
          </button>
          {message ? <div style={{ color: '#0f766e' }}>{message}</div> : null}
          {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>孩子列表</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {childrenProfiles.map((child) => {
            const report = reportsByStudent[child.id];
            const alerts = alertsByStudent[child.id] ?? [];
            const plan = plansByStudent[child.id];

            return (
              <div
                key={child.id}
                style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{child.nickname}</div>
                    <div style={{ color: '#475569', marginTop: 6 }}>年级：{child.grade}</div>
                    <div style={{ color: '#64748b', marginTop: 6 }}>
                      已开通学科：
                      {child.enrollments.filter((item) => item.enabled).map((item) => subjectMeta[item.subject].label).join('、') || '暂无'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => regeneratePlan(child)}
                      disabled={regeneratingPlanStudentId === child.id}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 12,
                        padding: '10px 14px',
                        background: '#fff',
                        color: '#0f172a',
                        cursor: regeneratingPlanStudentId === child.id ? 'wait' : 'pointer',
                      }}
                    >
                      {regeneratingPlanStudentId === child.id ? '重建中…' : '重建本周计划'}
                    </button>
                    <a
                      href={`/student/mission?studentId=${child.id}&subject=${selectedSubject}`}
                      style={{
                        display: 'inline-block',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#0f172a',
                        color: '#fff',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      进入{subjectMeta[selectedSubject].missionLabel}
                    </a>
                  </div>
                </div>

                {plan ? (
                  <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {subjectMeta[selectedSubject].label}周计划区间：{plan.weekStartDate} 至 {plan.weekEndDate}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.7, color: '#0f172a' }}>{plan.summary}</div>
                      <div style={{ marginTop: 10, color: '#475569' }}>建议日训练时长：{plan.availableMinutesPerDay} 分钟</div>
                    </div>

                      <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{subjectMeta[selectedSubject].label}本周训练目标</div>
                      {plan.goals.map((goal) => (
                        <div
                          key={goal}
                          style={{ padding: '10px 12px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}
                        >
                          {goal}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{subjectMeta[selectedSubject].label}每日节奏安排</div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {plan.dailyPlans.map((item) => (
                          <div
                            key={`${plan.id}-${item.date}`}
                            style={{
                              padding: 14,
                              borderRadius: 16,
                              border: '1px solid #e2e8f0',
                              background: '#fff',
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <strong>{item.date}</strong>
                              <span style={{ color: '#475569' }}>{item.estimatedMinutes} 分钟</span>
                            </div>
                            <div style={{ color: '#0f172a' }}>{item.goal}</div>
                            <div style={{ fontSize: 13, color: '#475569' }}>
                              聚焦知识点：{item.focusKnowledgePointNames.join('、')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {report ? (
                  <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {subjectMeta[selectedSubject].label}周报区间：{report.weekStartDate} 至 {report.weekEndDate}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.7, color: '#0f172a' }}>
                        {report.parentSummary}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                      {[
                        { label: '本周评估', value: `${report.assessmentCount} 次` },
                        { label: '完成任务', value: `${report.missionCompletedCount} 个` },
                        { label: '综合正确率', value: `${report.correctRate}%` },
                        { label: '提示使用', value: `${report.hintUsedCount} 次` },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{ padding: 14, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}
                        >
                          <div style={{ fontSize: 12, color: '#64748b' }}>{item.label}</div>
                          <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700 }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{subjectMeta[selectedSubject].label}本周重点</div>
                      {report.highlights.map((item) => (
                        <div
                          key={item}
                          style={{ padding: '10px 12px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{subjectMeta[selectedSubject].label}家长提醒</div>
                      {alerts.length > 0 ? (
                        alerts.map((alert) => (
                          <div
                            key={alert.id}
                            style={{
                              ...getRiskStyle(alert.level),
                              padding: 14,
                              borderRadius: 16,
                              border: '1px solid',
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{alert.summary}</div>
                            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{alert.action}</div>
                          </div>
                        ))
                      ) : (
                        <div
                          style={{
                            padding: 14,
                            borderRadius: 16,
                            background: '#ecfeff',
                            border: '1px solid #a5f3fc',
                            color: '#155e75',
                          }}
                        >
                          当前没有明显风险，家长更适合帮孩子保持稳定节奏。
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>{subjectMeta[selectedSubject].label}掌握度热力图</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {report.masterySnapshots.length > 0 ? (
                          report.masterySnapshots.map((snapshot) => (
                            <div
                              key={snapshot.knowledgePointId}
                              style={{
                                ...getStatusStyle(snapshot.status),
                                padding: '10px 12px',
                                borderRadius: 999,
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                              }}
                            >
                              <span>{snapshot.knowledgePointName}</span>
                              <strong>{snapshot.masteryScore}</strong>
                              <span style={{ fontSize: 12 }}>{getStatusLabel(snapshot.status)}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#64748b' }}>当前还没有足够数据生成热力图。</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 18, color: '#64748b' }}>
                    {loadingInsights ? `正在生成${subjectMeta[selectedSubject].label}周报、提醒和周计划…` : `当前还没有足够数据生成${subjectMeta[selectedSubject].label}周报。`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <AssistantWidget
        userRole="parent"
        studentId={childrenProfiles[0]?.id ?? null}
        subject={selectedSubject}
        pageContext="weekly_report"
        title={`${subjectMeta[selectedSubject].label}家长助教`}
        subtitle={`问我：现在我该怎么陪孩子学${subjectMeta[selectedSubject].label}`}
      />
    </main>
  );
}
