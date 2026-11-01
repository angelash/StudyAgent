'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { StudioCourse, StudioCourseHistory, StudioOverview } from '@study-agent/contracts';
import { ApiRequestError } from '../../lib/api';
import { refreshSessionUser } from '../../lib/session-user';
import { readStudioCourseHistory, readStudioCourseVersion, readStudioCourseVersionForLesson } from '../../lib/course-upgrade-client';
import { courseUpgradeOwnerSchema, upgradeCourseRevision, type CourseUpgradeOwner } from '../../lib/course-upgrade-copy';
import { readCourseVersionLocation, setCourseVersion } from '../../lib/course-version-navigation';
import { requestControlledCopyExit } from '../../components/controlled-copy-exit';
import { CourseUpgrade } from './course-upgrade';
import './course-builder.css';

type Props = { course: StudioCourse; actor: { id: string; role: string }; selected: StudioOverview['selected']; enrollmentPreview?: boolean; onChanged: () => Promise<void>; onConfirmed: (course: StudioCourse) => void;
  children: (course: StudioCourse, controls: React.ReactNode, archived: boolean) => React.ReactNode };
export function CourseWorkspace(props: Props) {
  if (props.enrollmentPreview) return props.children(props.course, null, false);
  const parsed = courseUpgradeOwnerSchema.safeParse({ actorId: props.actor.id, role: props.actor.role, studentId: props.course.studentId, subject: props.course.subject, courseId: props.course.id });
  if (!parsed.success) return <p role="alert">当前课程身份无法核对，请重新登录。</p>;
  return <CourseVersionWorkspace key={JSON.stringify(parsed.data)} {...props} owner={parsed.data}/>;
}
function CourseVersionWorkspace({ course, selected, onChanged, onConfirmed, children, owner }: Props & { owner: CourseUpgradeOwner }) {
  const route = useSearchParams(), location = JSON.stringify(['courseRevision', 'courseLesson'].map(key => route.getAll(key)));
  const [reload, setReload] = React.useState(0), [upgrading, setUpgrading] = React.useState<{ course: StudioCourse; focus: HTMLElement | null } | null>(null);
  const [result, setResult] = React.useState<{ key: string; history: StudioCourseHistory | null; course: StudioCourse | null; error: string; denied: boolean } | null>(null);
  const signature = JSON.stringify([location, owner, course.fingerprint, upgradeCourseRevision(course), reload]);
  React.useEffect(() => {
    const controller = new AbortController(), requested = readCourseVersionLocation(window.location.search);
    void (async () => {
      let history: StudioCourseHistory | null = null;
      try {
        history = await readStudioCourseHistory(owner, controller.signal);
        if (requested.kind === 'invalid') throw Error(requested.message);
        const version = requested.lessonId ? await readStudioCourseVersionForLesson(owner, requested.lessonId, controller.signal)
          : await readStudioCourseVersion(owner, requested.kind === 'version' ? requested.revision : history.currentRevision, controller.signal);
        if (requested.kind === 'version' && version.revision !== requested.revision || !history.versions.some(row => row.revision === version.revision && row.fingerprint === version.course.fingerprint)) throw Error('原课时与指定课程修订不同，请明确选择版本。');
        if (!controller.signal.aborted) setResult({ key: signature, history, course: version.revision === history.currentRevision && course.fingerprint === version.course.fingerprint && upgradeCourseRevision(course) === version.revision ? course : version.course, error: '', denied: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        const denied = error instanceof ApiRequestError && [401, 403].includes(error.status);
        if (denied) { setUpgrading(null); void refreshSessionUser(); }
        setResult({ key: signature, history: denied ? null : history, course: null, error: error instanceof Error ? error.message : '原课程版本暂时无法核对。', denied });
      }
    })();
    return () => controller.abort();
  }, [signature]);
  const actual = result?.key === signature ? result : null, history = actual?.history, snapshot = actual?.course;
  const shown = snapshot && history && upgradeCourseRevision(snapshot) === history.currentRevision && course.fingerprint === snapshot.fingerprint && upgradeCourseRevision(course) === history.currentRevision ? course : snapshot;
  function choose(value: string) {
    requestControlledCopyExit(() => { const url = new URL(window.location.href); setCourseVersion(url.searchParams, value === 'current' ? null : Number(value)); window.history.pushState(null, '', url.pathname + url.search); });
  }
  const currentLocation = readCourseVersionLocation('?' + route.toString()), archived = Boolean(shown && history && upgradeCourseRevision(shown) < history.currentRevision);
  const controls = <section className="ws-course-versions" aria-label="课程版本目录"><label>课程版本<select aria-label="课程内容修订" value={currentLocation.kind === 'version' ? String(currentLocation.revision) : currentLocation.kind === 'current' && !currentLocation.lessonId ? 'current' : shown ? String(upgradeCourseRevision(shown)) : ''} disabled={!history || actual?.denied} onChange={event => choose(event.target.value)}>
    {(!history || !shown && currentLocation.kind !== 'version') && <option value="">请明确选择版本</option>}<option value="current">跟随当前版本{history ? ' · 修订 ' + history.currentRevision : ''}</option>{history?.versions.map(row => <option key={row.revision} value={String(row.revision)}>内容修订 {row.revision} · {row.revision === history.currentRevision ? '当前' : '历史'} · {row.targets}目标</option>)}
  </select></label>{shown && <p role="status">内容修订 {upgradeCourseRevision(shown)} · {archived ? '历史版本，保留原教学与原记录' : '当前版本'}</p>}{actual?.error && <p role="alert">{actual.error}</p>}<button type="button" disabled={Boolean(upgrading)} onClick={() => { setReload(value => value + 1); void onChanged(); }}>重新核对课程版本</button>{shown && selected?.id === owner.studentId && <button type="button" onClick={event => setUpgrading({ course: shown, focus: event.currentTarget })}>{archived ? '核对原升级稿' : '更新课程教学'}</button>}{archived && <button type="button" onClick={() => choose('current')}>查看当前版本</button>}
    {history && <details><summary>版本时间与范围</summary>{history.versions.map(row => <p key={row.revision}>修订 {row.revision} · {new Date(row.at).toLocaleString('zh-CN')} · {row.targets} 目标 · {row.lessons} 课时</p>)}</details>}
  </section>;
  return <>{shown ? children(shown, controls, archived) : <section className="ws-course-version-pending" aria-label="核对原课程版本">{controls}{!actual && <p role="status">正在核对原课程版本…</p>}</section>}{upgrading && <CourseUpgrade owner={owner} course={upgrading.course} selected={selected} returnFocus={upgrading.focus} onClose={() => setUpgrading(null)} onConfirmed={value => { setUpgrading(null); onConfirmed(value); setReload(count => count + 1); }}/>}</>;
}
