'use client';
import type { SourceCourseView } from '@study-agent/contracts';
import { CompilationProgress } from './compilation-panel';

const language=(value:string)=>value==='en'?'英文':value==='zh-CN'?'中文':'沿用来源语言';
export function GenerationProgress({row}:{row:SourceCourseView}){
  if(row.compilation)return <CompilationProgress row={row}/>;
  const state=row.generation;if(!state)return null;
  const total=state.plannedLessons,of=total===null?'—':String(total);
  const stage=state.stage==='planning'?'正在规划课程路线':state.stage==='writing'?`正在编写第${Math.min(state.draftedLessons+1,total??1)}/${of}课`
    :state.stage==='reviewing'?`正在复核第${Math.min(state.reviewedLessons+1,total??1)}/${of}课`:state.stage==='integrating'?'正在整合课程候选':'课程候选已生成，等待你核对';
  const display=row.status==='failed'?'未完成：'+stage.replace(/^正在/,''):row.status==='cancelled'?'已取消，保留当前进度':row.status==='queued'?'已排队，等待生成任务开始':stage;
  return <section className="sc-generation-progress" aria-label="课程生成进度"><header><small>GENERATION PROGRESS</small><b>{display}</b></header><dl><div><dt>课程路线</dt><dd>{total===null?'待规划':`${total}课已规划`}</dd></div><div><dt>已保存讲解稿</dt><dd>{state.draftedLessons}/{of}</dd></div><div><dt>已取得复核记录</dt><dd>{state.reviewedLessons}/{of}</dd></div></dl>
    {['failed','cancelled'].includes(row.status)&&<p>已保存的阶段会保留。相同目标和来源下重试，从尚未完成的阶段继续。</p>}</section>;
}
export function GenerationReview({row}:{row:SourceCourseView}){
  const state=row.compilation?{...row.compilation,uncoveredSourceKeys:[] as string[]}:row.generation;if(!state?.reviews.length)return null;
  const list=<ul>{state.reviews.map(review=><li key={review.lessonIndex} data-decision={review.decision}><span>{review.lessonTitle}</span><b>{review.decision==='pass'?'模型未报告问题':review.decision==='revised'?'模型提供了修订':'仍需人工核对'}</b>{review.issueCount>0&&<small>{review.issueCount}处建议或疑问</small>}</li>)}</ul>;
  return <section className="sc-generation-review" aria-label="生成稿复核概况"><header><small>CONTENT CHECKS</small><h2>保留复核问题，逐项核对。</h2></header><p>{state.reviewCurrent?'下面记录这次模型复核的结果。':'当前内容有修改；下面的复核针对修改前的生成稿。'}模型复核不能代替教师内容审核。</p>{row.compilation&&state.reviews.length>6?<details className="sc-long-reviews"><summary>查看全部课时复核（{state.reviews.length}课 · {state.reviews.filter(review=>review.decision!=='pass').length}课有建议或疑问）</summary><div tabIndex={0} role="region" aria-label="全部课时复核记录">{list}</div></details>:list}
    {row.status==='ready'&&row.permissions.manage&&<p>在“编辑讲解与练习”中可查看具体问题、原始稿与引用，再决定如何修订。</p>}
    {state.scopeNote&&<p><b>本次教学范围：</b>{state.scopeNote}</p>}{state.uncoveredSourceKeys.length>0&&<p>未编入本次教学：{row.sources.filter(source=>state.uncoveredSourceKeys.includes(source.key)).map(source=>`${source.title}·第${source.page}${source.kind==='text'?'段':'页'}`).join('、')}。</p>}</section>;
}
export function GenerationOrigin({row}:{row:SourceCourseView}){
  if(!row.permissions.manage)return null;const input=row.generationInput;
  const model=row.compilation??row.generation;
  return <details className="sc-generation-origin"><summary>查看原始生成目标与模型</summary>{input?<dl><div><dt>生成时名称</dt><dd>{input.title}</dd></div><div><dt>生成时目标</dt><dd>{input.goal}</dd></div><div><dt>原定语言与预算</dt><dd>{language(input.language)} · 每次{input.minutesPerSession}分钟</dd></div><div><dt>本次实际模型</dt><dd>{model?.modelName??'尚未开始调用'}{model?.modelId?' · '+model.modelId:''}</dd></div></dl>:<p>这份旧记录没有可核对的原始生成输入，不能用当前目标倒推。</p>}</details>;
}
