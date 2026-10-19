'use client';
import * as React from 'react';
import Link from 'next/link';
import type { Subject } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { FamilyOverview, masteryNames, subjectNames } from '../../../lib/learning';
import { StudyNav } from '../../../components/study-nav';
import { AssistantWidget } from '../../../components/assistant-widget';
import '../../student/assessment/studio.css';
import '../../student/today/today.css';
import './family.css';

export function FamilyStudio() {
  const [overview, setOverview] = React.useState<FamilyOverview | null>(null), [studentId, setStudentId] = React.useState('');
  const [subject, setSubject] = React.useState<Subject>('math'), [nickname, setNickname] = React.useState(''), [grade, setGrade] = React.useState(3);
  const [loading, setLoading] = React.useState(true), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [showCreate, setShowCreate] = React.useState(false), [expanded, setExpanded] = React.useState('');
  React.useEffect(() => { let alive = true;
    apiRequest<FamilyOverview>('/learning/overview').then((value) => { if (alive) { setOverview(value); const requested = new URLSearchParams(window.location.search).get('studentId'); setStudentId(value.children.find((child) => child.id === requested)?.id ?? value.children[0]?.id ?? ''); } })
      .catch((caught) => { if (alive) setError(caught.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const child = overview?.children.find((item) => item.id === studentId), data = child?.subjects.find((item) => item.subject === subject);
  const diagnosticsHref = `/student/assessment?studentId=${studentId}&subject=${subject}`, todayHref = `/student/today?studentId=${studentId}&subject=${subject}`;
  const due = data?.today.reviews.filter((item) => item.due && item.status !== 'completed') ?? [];
  const hypotheses = data?.hypotheses.filter((item) => !['resolved', 'contradicted', 'withdrawn'].includes(item.status)) ?? [];
  async function createChild(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await apiRequest<{ profile: { id: string } }>('/students', { method: 'POST', body: JSON.stringify({ nickname, grade, preferredSessionMinutes: 15,
        defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } }) });
      setOverview(await apiRequest<FamilyOverview>('/learning/overview')); setStudentId(created.profile.id); setNickname(''); setShowCreate(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '建档未完成，请重试'); } finally { setBusy(false); }
  }
  return <main className="learning-studio family-studio"><StudyNav current="family" /><div className="family-layout">
    <aside className="family-rail"><span className="studio-eyebrow">FAMILY JOURNAL / 看见每一步</span><h1>看见孩子，<br /><em>怎样学会。</em></h1><p>从具体知识点出发，陪孩子找到问题，试一试，再验证。</p>
      {overview && <><label>孩子的学习档案<select value={studentId} onChange={(e) => { setStudentId(e.target.value); setExpanded(''); }} aria-label="选择学生">{overview.children.map((item) => <option key={item.id} value={item.id}>{item.nickname} · {item.grade}年级</option>)}</select></label><button className="studio-text-button" onClick={() => setShowCreate(!showCreate)}>{showCreate ? '收起建档' : '＋ 添加孩子档案'}</button></>}
      <div className="family-support"><strong>陪伴小提醒</strong><p>先问“你是怎么想的”，再一起找卡住的步骤。一次表现只能告诉我们当时的情况。</p></div>
    </aside>
    <section className="studio-main" aria-busy={loading || busy}>
      {error && <div className="studio-error" role="alert">{error}<button aria-label="关闭提示" onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="studio-empty" role="status">正在整理学习记录…</div> : !overview ? <div className="studio-empty"><h2>孩子的成长，从这里留下。</h2><p>登录后，查看学习范围、具体证据、指导计划与复测。</p><Link className="studio-primary" href="/parent/login">登录或创建账号 ↗</Link></div> : <>
        {(showCreate || !overview.children.length) && <form className="family-create" onSubmit={createChild}><h2>建立孩子的学习档案</h2><p>先确认当前年级，再逐科勾选已经学习的内容。</p><div><label>孩子昵称<input required maxLength={50} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="怎么称呼孩子" /></label><label>当前年级<select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}年级</option>)}</select></label><button className="studio-primary" disabled={busy || !nickname.trim()}>{busy ? '正在保存…' : '保存档案 ↗'}</button></div></form>}
        {child && data && <>
          <div className="studio-section-head"><span className="studio-eyebrow">{overview.day} / 学习观察</span><h2>{child.nickname}的每一步，<br />都有迹可循。</h2><p>当前 {child.grade} 年级。先看学过什么，再看有哪些证据，最后决定下一步。</p></div>
          <div className="studio-subjects">{Object.entries(subjectNames).map(([key, name]) => <button key={key} aria-pressed={subject === key} onClick={() => { setSubject(key as Subject); setExpanded(''); }}>{name}</button>)}</div>
          <div className="family-next"><div><span className="studio-eyebrow">NEXT SMALL STEP / 接下来</span><h3>{!data.scope ? '先确认当前学习进度' : due.length ? `${due.length} 组复测已经到期` : data.today.incompleteAssessments.length ? '继续上次保存的小测' : data.today.plan ? '按计划，练习一个具体知识点' : data.today.awaitingConfirmation ? '查看并确认指导计划' : '做一组适合当前进度的小测'}</h3><p>{!data.scope ? '选择教材与已学范围，让题目适合孩子当前的进度。' : data.today.plan?.summary ?? '用独立作答观察具体表现；证据不足时，先补充测量。'}</p></div><Link className="studio-primary" href={due.length || data.today.plan ? todayHref : diagnosticsHref}>{due.length ? '去复测' : data.today.plan ? '进入今日学习' : '进入知识诊断'} ↗</Link></div>
          {data.today.plan?.impact.needsReview && <div className="studio-hint" role="status"><strong>指导计划需要重新核对</strong><p>{data.today.plan.impact.message}</p><Link className="studio-secondary" href={`${diagnosticsHref}&view=plan&planId=${data.today.plan.id}`}>查看新依据并调整计划 ↗</Link></div>}<div className="family-metrics">{[[data.counts.selected, '已确认学习的知识点'], [data.estimates.filter((item) => item.scoredCount > 0).length, '已有观察证据'], [data.counts.secure, '通过迁移与保持验证'], [data.counts.unknown + data.counts.needsEvidence, '仍需补充测量']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
          <div className="family-section-title"><div><span className="studio-eyebrow">KNOWLEDGE & EVIDENCE</span><h3>把知识揉碎，把依据展开。</h3></div><Link className="studio-text-button" href={diagnosticsHref}>调整学习范围 ↗</Link></div>
          {data.scope ? <p className="studio-muted">{subjectNames[subject]} · {data.scope.grade}年级{data.scope.term === 'upper' ? '上' : '下'}学期 · {data.scope.textbookVersion} · {data.counts.selected} 个已学点</p> : <p className="studio-muted">尚未确认该科进度；完成确认后，再展示范围内的知识点。</p>}
          <div className="family-map">{data.estimates.map((item) => <button key={item.atomId} data-status={item.status} aria-expanded={expanded === item.atomId} onClick={() => setExpanded(expanded === item.atomId ? '' : item.atomId)}><span className="family-map-dot" /><span>{item.atomName}<small>{masteryNames[item.status]}</small></span><b>{item.mastery === null ? '—' : `${Math.round(item.mastery)}%`}</b></button>)}</div>
          {!data.estimates.length && <p className="family-empty">还没有选入已学知识点。先确认范围，再安排评测。</p>}
          {data.estimates.filter((item) => item.atomId === expanded).map((item) => <div className="family-detail" key={item.atomId}><h4>{item.atomName}</h4><p>{item.mastery === null ? '尚未有足够证据进行估计。' : `当前掌握估计 ${item.mastery}%，区间 ${item.lower}%–${item.upper}%。这是一项规则估计，尚无常模校准。`}</p><p>{item.scoredCount} 道已评分题 · {item.independentFamilies} 个独立题族 · {item.effectiveSamples} 个有效样本</p><div className="studio-dimensions">{item.dimensions.map((dimension) => <span key={dimension.dimension}>{({ understanding: '理解', procedure: '步骤', transfer: '迁移', retention: '保持' })[dimension.dimension]}<strong>{dimension.mastery === null ? '尚未测量' : `${dimension.mastery}%`}</strong><small>{dimension.samples} 个有效样本</small></span>)}</div><p>{item.transferVerified ? '迁移已有支持证据' : '迁移仍需独立新题验证'} · {item.retentionVerified ? '保持已有延迟证据' : '保持仍需间隔复测'}</p><Link className="studio-secondary" href={data.latestSessionId ? `${diagnosticsHref}&session=${data.latestSessionId}` : diagnosticsHref}>展开评测与证据 ↗</Link></div>)}
          <h3 className="studio-line-title">问题可能出在哪里。</h3><p className="studio-muted">以下是待验证的解释。结合支持与反证，逐步修正。</p>
          <div className="family-hypotheses">{hypotheses.length ? hypotheses.map((item) => <details key={item.id}><summary><span>{item.title}</span><small>{item.status === 'supported' ? '已有支持证据' : item.status === 'inconclusive' ? '证据不一致' : '需要验证'}</small></summary><p><strong>看到的表现：</strong>{item.observation}</p><p><strong>可能的原因：</strong>{item.explanation}</p><p>支持证据 {item.supportingEvidenceIds.length} 条，反证 {item.counterEvidenceIds.length} 条。</p><p>其他解释：{item.alternatives.join('；')}</p><div className="studio-hint">下一步：{item.nextAction}</div><Link className="studio-text-button" href={data.latestSessionId ? `${diagnosticsHref}&session=${data.latestSessionId}` : diagnosticsHref}>查看依据并验证 ↗</Link></details>) : <p className="family-empty">当前没有形成待验证假设；继续收集具体表现。</p>}</div>
          <h3 className="studio-line-title">这一周，留下了什么。</h3><div className="family-week">{[[data.week.completedAssessments, '完成的评测'], [data.week.completedActivities, '完成的指导活动'], [data.week.observations, '保存的作答观察']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
          <p className="studio-muted">活动完成表示练习发生过。是否学得更稳，还需比较同一量规下的独立新题和延迟复测。</p>
          {data.trend.length > 0 && <div className="family-timeline">{data.trend.map((item) => <Link key={`${item.sessionId}:${item.at}`} href={`${diagnosticsHref}&session=${item.sessionId}`}><span>{new Date(item.at).toLocaleDateString('zh-CN')}</span><strong>观察了 {item.measuredPoints} 个知识点</strong><small>{item.sufficientPoints} 个点的证据量达到初步判断要求 ↗</small></Link>)}</div>}
          <div className="family-bottom"><Link className="studio-secondary" href={todayHref}>查看今日安排与错题 ↗</Link>{data.today.plan && <Link className="studio-secondary" href={`${diagnosticsHref}&view=plan`}>指导计划与复盘 ↗</Link>}<Link className="studio-text-button" href={`/parent/access?studentId=${studentId}`}>复核授权与反馈记录 ↗</Link><Link className="studio-text-button" href="/library">浏览题卷资料 ↗</Link></div>
        </>}
      </>}
    </section></div>{child && <AssistantWidget userRole="parent" studentId={studentId} subject={subject} pageContext="weekly_report" title="家长陪伴助教" subtitle="一起看看具体证据和下一步" />}</main>;
}
