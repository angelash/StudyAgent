'use client';
import type { SourceCoursePreflight,SourceCourseView,SourceCoverage } from '@study-agent/contracts';
import { WorkspaceDialog } from '../workspace-dialog';
import './compilation.css';

export function SourcePreflightDialog({value,busy,error,onClose,onConfirm}:{value:SourceCoursePreflight|null;busy:string;error:string;onClose:()=>void;onConfirm:()=>void}){
  return <WorkspaceDialog onClose={onClose} busy={busy==='generate'}><section className="sc-dialog sc-preflight" role="dialog" aria-modal="true" aria-label="资料编排范围"><header><div><small>CHECK YOUR SOURCES</small><h2>先核对范围，再编成课程。</h2></div><button type="button" aria-label="关闭资料范围" disabled={busy==='generate'} onClick={onClose}>×</button></header>
    {!value?<p role="status">正在核对选中的原文、结构和编排预算…</p>:<><div className="sc-preflight-counts"><div><b>{value.pages}</b><span>页或段原文</span></div><div><b>{value.characters.toLocaleString()}</b><span>原文字符</span></div><div><b>{value.chunks.length}</b><span>保留原文的片段</span></div></div><p>{value.requiresLongMode?'这份资料会先分片段整理，再逐课编写和核对。':'这份资料适合直接编成一组短课。'}原文不会自动省略；生成后还需核对讲解和未采用范围。</p>
    {value.warnings.length>0&&<div className="sc-compilation-warning">{value.warnings.map(warning=><p key={warning}>{warning}</p>)}</div>}{value.issues.length>0&&<div className="sc-error" role="alert">{value.issues.map(issue=><p key={issue}>{issue}</p>)}</div>}
    <details><summary>查看完整原文范围（{value.sources.length}）</summary><ol>{value.sources.map(source=><li key={source.key}><b>{source.title} · 第{source.page}{source.kind==='text'?'段':'页'}</b><span>{source.characters.toLocaleString()} 字{source.reviewRequired?' · 结构待核对':''}</span></li>)}</ol></details></>}
    {error&&<p className="sc-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy==='generate'} onClick={onClose}>返回调整范围</button><button type="button" className="sc-primary" disabled={!value?.valid||Boolean(busy)} onClick={onConfirm}>{busy==='generate'?'正在保存生成任务…':'确认范围并生成'}</button></footer>
  </section></WorkspaceDialog>;
}
export function CompilationProgress({row}:{row:SourceCourseView}){
  const state=row.compilation;if(!state)return null;
  const stage=state.stage==='indexing'?'正在整理原文片段':state.stage==='planning'?'正在编排课程路线':state.stage==='writing'?'正在逐课编写讲解':state.stage==='reviewing'?'正在核对原文条件与练习':state.stage==='integrating'?'正在整合课程候选':'课程候选已保存';
  return <section className="sc-generation-progress sc-compilation-progress" aria-label="长资料编排进度"><header><small>SOURCE TO LESSONS</small><b>{row.status==='queued'?'已排队，等待开始':row.status==='cancelled'?'已取消，保留已保存的阶段':row.status==='failed'?'生成中断，保留已保存的阶段':stage}</b></header><dl><div><dt>已整理原文片段</dt><dd>{state.indexedChunks} / {state.chunks}</dd></div><div><dt>已保存路线分组</dt><dd>{state.plannedGroups} / {state.planGroups}</dd></div><div><dt>已保存讲解稿</dt><dd>{state.draftedLessons} / {state.plannedLessons??'—'}</dd></div><div><dt>已取得复核记录</dt><dd>{state.reviewedLessons} / {state.plannedLessons??'—'}</dd></div></dl><p>这里统计实际保存的阶段。离开后可以恢复；索引与模型复核仍需结合原文检查。</p></section>;
}
export function SourceCoveragePanel({row,onSource}:{row:SourceCourseView;onSource:(part:SourceCoverage)=>void}){
  const state=row.compilation;if(!state||!state.coverage.length)return null;const current=new Set(row.lessons.map(lesson=>lesson.id)),cited=state.coverage.filter(part=>part.citedLessonIds.length).length;
  return <section className="sc-coverage" aria-label="原文使用清单"><header><div><small>TRACE EVERY SOURCE</small><h2>知道原文去了哪里。</h2></div><span>{cited} / {state.chunks} 片段有当前课时引用</span></header><p>引用说明课程使用了这部分原文，完整知识覆盖仍需逐课核对。移除课时后，原文与最初规划继续保留。</p><details><summary>展开全部原文片段与未采用范围</summary><ol tabIndex={0} aria-label="完整原文片段清单">{state.coverage.map((part,index)=>{const active=part.plannedLessonIds.filter(id=>current.has(id));return<li key={part.key} data-gap={!part.citedLessonIds.length}><div><b>{part.title} · 第{part.page}页/段 · 片段 {index+1}</b><span>{part.citedLessonIds.length?'已被 '+part.citedLessonIds.length+' 个课时引用':part.omittedReason?'规划中未采用':part.plannedLessonIds.length&&!active.length?'原规划课时已移除':'当前课时尚未引用'}</span></div>{part.omittedReason&&<p>{part.omittedReason}</p>}{part.reviewRequired&&<p>这部分仍有结构或索引内容需要对照原文核对。</p>}<button type="button" onClick={()=>onSource(part)}>定位原文 ↗</button></li>;})}</ol></details></section>;
}
