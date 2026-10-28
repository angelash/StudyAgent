'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Subject } from '@study-agent/contracts';
import { AssistantWidget } from '../../../components/assistant-widget';
import { apiRequest, getAuthToken } from '../../../lib/api';

type SubjectEnrollment = {
  subject: Subject;
  enabled: boolean;
  textbookVersionId: string;
};

type KnowledgeQuestion = {
  id: string;
  stem: string;
  status: 'draft' | 'published';
  difficultyLevel: number;
  sourceLabel: string | null;
};

type KnowledgePointNode = {
  id: string;
  name: string;
  difficultyLevel: number;
  status: 'draft' | 'published';
  masteryScore: number;
  confidenceScore: number;
  masteryStatus: 'unknown' | 'learning' | 'unstable' | 'mastered' | 'at_risk';
  questionCount: number;
  publishedQuestionCount: number;
  draftQuestionCount: number;
  questions: KnowledgeQuestion[];
};

type LessonNode = {
  id: string;
  title: string;
  sortOrder: number;
  knowledgePoints: KnowledgePointNode[];
};

type UnitNode = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LessonNode[];
};

type KnowledgeMap = {
  studentId: string;
  subject: Subject;
  enrollment: SubjectEnrollment | null;
  volume: {
    id: string;
    displayName: string;
    publisherVersion: string;
    grade: number;
    term: 'first' | 'second';
    sourcePath: string;
  } | null;
  summary: {
    unitCount: number;
    lessonCount: number;
    knowledgePointCount: number;
    questionCount: number;
    publishedQuestionCount: number;
    draftQuestionCount: number;
    masteredCount: number;
    learningCount: number;
    unstableCount: number;
    atRiskCount: number;
    unknownCount: number;
  };
  units: UnitNode[];
};

const subjectMeta: Record<Subject, { label: string; assistantTitle: string; assistantSubtitle: string }> = {
  chemistry: { label: '化学', assistantTitle: '化学学习助教', assistantSubtitle: '先核对物质、条件和证据，再解释现象。' },
  chinese: {
    label: '语文',
    assistantTitle: '语文知识助教',
    assistantSubtitle: '问我：这个知识点应该先看哪一课',
  },
  math: {
    label: '数学',
    assistantTitle: '数学知识助教',
    assistantSubtitle: '问我：这个知识点和哪类题最相关',
  },
  english: {
    label: '英语',
    assistantTitle: '英语知识助教',
    assistantSubtitle: '问我：这个知识点应该先背单词还是练句型',
  },
};

function parseSubject(value: string | null): Subject {
  return value === 'chinese' || value === 'english' || value === 'math' || value === 'chemistry' ? value : 'math';
}

function getMasteryLabel(status: KnowledgePointNode['masteryStatus']) {
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
      return '待学习';
  }
}

function getMasteryTone(status: KnowledgePointNode['masteryStatus']) {
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

function formatGradeTerm(grade: number, term: 'first' | 'second') {
  return `${grade} 年级${term === 'first' ? '上册' : '下册'}`;
}

export function StudentKnowledgeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const studentId = params.get('studentId');
  const subject = parseSubject(params.get('subject'));

  const [knowledgeMap, setKnowledgeMap] = React.useState<KnowledgeMap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!studentId) {
      setLoading(false);
      setKnowledgeMap(null);
      setError('缺少 studentId，暂时无法加载知识体系。');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void apiRequest<KnowledgeMap>(`/students/${studentId}/knowledge-map?subject=${subject}`, {}, getAuthToken())
      .then((result) => {
        if (cancelled) {
          return;
        }
        setKnowledgeMap(result);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : '知识体系加载失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, subject]);

  const priorityKnowledgePoints = React.useMemo(() => {
    if (!knowledgeMap) {
      return [];
    }

    return knowledgeMap.units
      .flatMap((unit) =>
        unit.lessons.flatMap((lesson) =>
          lesson.knowledgePoints.map((knowledgePoint) => ({
            ...knowledgePoint,
            lessonTitle: lesson.title,
            unitTitle: unit.title,
          })),
        ),
      )
      .sort((left, right) => {
        const severityOrder = getSeverity(left.masteryStatus) - getSeverity(right.masteryStatus);
        if (severityOrder !== 0) {
          return severityOrder;
        }
        return left.masteryScore - right.masteryScore;
      })
      .slice(0, 6);
  }, [knowledgeMap]);

  return (
    <main style={{ padding: 40, maxWidth: 1320, margin: '0 auto' }}>
      <section style={heroSectionStyle}>
        <div>
          <h1 style={{ margin: 0 }}>学生知识体系</h1>
          <div style={{ color: '#475569', marginTop: 10, lineHeight: 1.8, maxWidth: 860 }}>
            这里会把当前学科的教材、单元课时、知识点、题目和掌握状态放到同一张学习地图里，方便孩子和家长一起看清楚“现在学到哪里、哪里已经掌握、下一步先练什么”。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(Object.keys(subjectMeta) as Subject[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => router.push(`/student/knowledge?studentId=${studentId ?? ''}&subject=${item}`)}
              style={{
                ...subjectButtonStyle,
                borderColor: subject === item ? '#0f172a' : '#cbd5e1',
                background: subject === item ? '#0f172a' : '#ffffff',
                color: subject === item ? '#ffffff' : '#0f172a',
              }}
            >
              {subjectMeta[item].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => router.push(`/student/mission?studentId=${studentId ?? ''}&subject=${subject}`)}
            style={secondaryButtonStyle}
          >
            去做今日任务
          </button>
        </div>
      </section>

      {loading ? <section style={sectionStyle}>知识体系加载中...</section> : null}
      {!loading && error ? <section style={{ ...sectionStyle, color: '#b91c1c' }}>{error}</section> : null}

      {!loading && !error && knowledgeMap?.volume ? (
        <>
          <section style={sectionStyle}>
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <article style={metricCardStyle}>
                <div style={metricLabelStyle}>当前教材</div>
                <div style={metricValueStyle}>{knowledgeMap.volume.displayName}</div>
                <div style={metricHintStyle}>
                  {knowledgeMap.volume.publisherVersion} · {formatGradeTerm(knowledgeMap.volume.grade, knowledgeMap.volume.term)}
                </div>
              </article>
              <article style={metricCardStyle}>
                <div style={metricLabelStyle}>知识点</div>
                <div style={metricValueStyle}>{knowledgeMap.summary.knowledgePointCount}</div>
                <div style={metricHintStyle}>
                  {knowledgeMap.summary.unitCount} 个单元 · {knowledgeMap.summary.lessonCount} 个课时
                </div>
              </article>
              <article style={metricCardStyle}>
                <div style={metricLabelStyle}>已发布题</div>
                <div style={metricValueStyle}>{knowledgeMap.summary.publishedQuestionCount}</div>
                <div style={metricHintStyle}>可直接进入评估和任务练习</div>
              </article>
              <article style={metricCardStyle}>
                <div style={metricLabelStyle}>待整理题</div>
                <div style={metricValueStyle}>{knowledgeMap.summary.draftQuestionCount}</div>
                <div style={metricHintStyle}>还在补答案、解析和作答协议</div>
              </article>
            </div>

            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 20 }}>
              <article style={panelCardStyle}>
                <div style={panelTitleStyle}>教材定位</div>
                <div style={{ color: '#0f172a', fontWeight: 700, marginTop: 8 }}>{knowledgeMap.volume.displayName}</div>
                <div style={{ color: '#475569', marginTop: 8 }}>
                  版本：{knowledgeMap.volume.publisherVersion}
                </div>
                <div style={{ color: '#475569', marginTop: 6 }}>
                  册次：{formatGradeTerm(knowledgeMap.volume.grade, knowledgeMap.volume.term)}
                </div>
                <div style={{ color: '#64748b', marginTop: 14, lineHeight: 1.7, wordBreak: 'break-all' }}>
                  来源路径：{knowledgeMap.volume.sourcePath}
                </div>
              </article>

              <article style={panelCardStyle}>
                <div style={panelTitleStyle}>当前掌握概况</div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: 14 }}>
                  <div style={statusCardStyle('#dcfce7')}>
                    <strong>{knowledgeMap.summary.masteredCount}</strong>
                    <span>已掌握</span>
                  </div>
                  <div style={statusCardStyle('#dbeafe')}>
                    <strong>{knowledgeMap.summary.learningCount}</strong>
                    <span>学习中</span>
                  </div>
                  <div style={statusCardStyle('#fef3c7')}>
                    <strong>{knowledgeMap.summary.unstableCount}</strong>
                    <span>待稳固</span>
                  </div>
                  <div style={statusCardStyle('#fee2e2')}>
                    <strong>{knowledgeMap.summary.atRiskCount}</strong>
                    <span>需关注</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section style={sectionStyle}>
            <div
              style={{
                display: 'grid',
                gap: 24,
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 18 }}>
                <div>
                  <h2 style={{ marginBottom: 6 }}>课本与知识点结构</h2>
                  <div style={{ color: '#64748b', lineHeight: 1.7 }}>
                    每个知识点都会挂在具体课时下，并显示当前掌握状态和可练习的题目。这样孩子可以先看课，再看点，再练题。
                  </div>
                </div>

                {knowledgeMap.units.map((unit) => (
                  <article key={unit.id} style={unitCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{unit.title}</div>
                        <div style={{ color: '#64748b', marginTop: 6 }}>{unit.lessons.length} 个课时</div>
                      </div>
                      <span style={miniBadgeStyle}>{subjectMeta[subject].label}单元</span>
                    </div>

                    <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
                      {unit.lessons.map((lesson) => (
                        <section key={lesson.id} style={lessonCardStyle}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{lesson.title}</div>
                            <div style={{ color: '#64748b' }}>{lesson.knowledgePoints.length} 个知识点</div>
                          </div>

                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
                            {lesson.knowledgePoints.map((knowledgePoint) => {
                              const publishedQuestions = knowledgePoint.questions.filter((item) => item.status === 'published');
                              const draftQuestions = knowledgePoint.questions.filter((item) => item.status === 'draft');

                              return (
                                <article key={knowledgePoint.id} style={knowledgePointCardStyle}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                    <div>
                                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{knowledgePoint.name}</div>
                                      <div style={{ color: '#64748b', marginTop: 6 }}>
                                        难度 {knowledgePoint.difficultyLevel} · 置信度 {knowledgePoint.confidenceScore}
                                      </div>
                                    </div>
                                    <span style={{ ...statusPillBaseStyle, ...getMasteryTone(knowledgePoint.masteryStatus) }}>
                                      {getMasteryLabel(knowledgePoint.masteryStatus)}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                                    <span style={miniBadgeStyle}>已发布题 {knowledgePoint.publishedQuestionCount}</span>
                                    <span style={miniBadgeStyle}>待整理题 {knowledgePoint.draftQuestionCount}</span>
                                    <span style={miniBadgeStyle}>掌握度 {knowledgePoint.masteryScore}</span>
                                  </div>

                                  {publishedQuestions.length > 0 ? (
                                    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                                      {publishedQuestions.map((question) => (
                                        <div key={question.id} style={questionCardStyle}>
                                          <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: 1.6 }}>{question.stem}</div>
                                          <div style={{ color: '#64748b', marginTop: 6 }}>
                                            已发布 · 难度 {question.difficultyLevel}
                                            {question.sourceLabel ? ` · 来源 ${question.sourceLabel}` : ''}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#64748b', marginTop: 14 }}>当前还没有可直接练习的已发布题。</div>
                                  )}

                                  {draftQuestions.length > 0 ? (
                                    <div style={{ color: '#64748b', marginTop: 12, lineHeight: 1.7 }}>
                                      另外还有 {draftQuestions.length} 道待整理题，后续补全后会加入正式题库。
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <aside style={{ display: 'grid', gap: 18 }}>
                <article style={panelCardStyle}>
                  <div style={panelTitleStyle}>当前优先关注</div>
                  <div style={{ color: '#64748b', marginTop: 8, lineHeight: 1.7 }}>
                    这里会优先展示当前还没掌握稳、或者还没有形成足够练习记录的知识点。
                  </div>

                  <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                    {priorityKnowledgePoints.map((knowledgePoint) => (
                      <div key={knowledgePoint.id} style={focusCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{knowledgePoint.name}</div>
                          <span style={{ ...statusPillBaseStyle, ...getMasteryTone(knowledgePoint.masteryStatus) }}>
                            {getMasteryLabel(knowledgePoint.masteryStatus)}
                          </span>
                        </div>
                        <div style={{ color: '#475569', marginTop: 8 }}>
                          {knowledgePoint.unitTitle} / {knowledgePoint.lessonTitle}
                        </div>
                        <div style={{ color: '#64748b', marginTop: 6 }}>
                          掌握度 {knowledgePoint.masteryScore} · 已发布题 {knowledgePoint.publishedQuestionCount}
                        </div>
                      </div>
                    ))}
                    {priorityKnowledgePoints.length === 0 ? <div style={{ color: '#64748b' }}>当前还没有可分析的知识点。</div> : null}
                  </div>
                </article>

                <article style={panelCardStyle}>
                  <div style={panelTitleStyle}>怎么用这张图</div>
                  <div style={{ display: 'grid', gap: 10, marginTop: 14, color: '#475569', lineHeight: 1.7 }}>
                    <div>1. 先从当前教材单元里找到正在学的课时，再看下面挂着哪些知识点。</div>
                    <div>2. 优先处理“需关注”和“待稳固”的知识点，它们更适合先安排练习。</div>
                    <div>3. 已发布题可以直接进入评估或今日任务；草稿题说明内容已经导入，但还在整理中。</div>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        </>
      ) : null}

      {!loading && !error && !knowledgeMap?.volume ? (
        <section style={sectionStyle}>当前学科还没有可用教材，先到内容后台准备教材和题库后再查看知识体系。</section>
      ) : null}

      <AssistantWidget
        subject={subject}
        userRole="student"
        pageContext="student_home"
        studentId={studentId}
        title={subjectMeta[subject].assistantTitle}
        subtitle={subjectMeta[subject].assistantSubtitle}
      />
    </main>
  );
}

function getSeverity(status: KnowledgePointNode['masteryStatus']) {
  switch (status) {
    case 'at_risk':
      return 0;
    case 'learning':
      return 1;
    case 'unstable':
      return 2;
    case 'unknown':
      return 3;
    case 'mastered':
    default:
      return 4;
  }
}

const heroSectionStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 20,
  flexWrap: 'wrap',
  alignItems: 'flex-start',
};

const sectionStyle: React.CSSProperties = {
  marginTop: 28,
  padding: 24,
  borderRadius: 24,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
};

const subjectButtonStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 999,
  padding: '10px 16px',
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
  fontWeight: 700,
};

const metricCardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 20,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const metricLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 13,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  color: '#0f172a',
  marginTop: 10,
  lineHeight: 1.2,
};

const metricHintStyle: React.CSSProperties = {
  color: '#475569',
  marginTop: 10,
  lineHeight: 1.6,
};

const panelCardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 20,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#0f172a',
};

const statusCardStyle = (background: string): React.CSSProperties => ({
  padding: 14,
  borderRadius: 16,
  background,
  display: 'grid',
  gap: 6,
});

const unitCardStyle: React.CSSProperties = {
  padding: 22,
  borderRadius: 24,
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.04)',
};

const lessonCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 20,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const knowledgePointCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  display: 'grid',
  alignContent: 'start',
};

const questionCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const focusCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
};

const miniBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  color: '#334155',
  fontSize: 12,
  fontWeight: 700,
};

const statusPillBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
