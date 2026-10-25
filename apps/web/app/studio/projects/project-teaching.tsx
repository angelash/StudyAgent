'use client';
import * as React from 'react';
import type { CourseProjectView,ProjectStage } from '@study-agent/contracts';
import { projectTeachingSteps } from '@study-agent/contracts';
import { WorkspaceDialog } from '../workspace-dialog';
import { useProjectNarration } from './project-narration';
import './project-teaching.css';

export function ProjectTeachingNavigator({project,stage,stepId,busy,onStep,onStage,onClose,onCompleteView,onAssistant,onAccessLost}:{
  project:CourseProjectView;stage:ProjectStage;stepId:string;busy:boolean;onStep:(id:string)=>void;onStage:(id:string)=>void;onClose:()=>void;onCompleteView:()=>void;onAssistant:()=>void;onAccessLost:()=>void;
}){
  const steps=projectTeachingSteps(stage),index=Math.max(0,steps.findIndex(step=>step.id===stepId)),step=steps[index];
  const narration=useProjectNarration(project,stage.id,step.id,onAccessLost),[settings,setSettings]=React.useState(false);
  const submitted=new Set(project.submissions.map(item=>item.stageId)).size,reviewed=project.definition.stages.filter(stage=>{
    const submission=project.submissions.filter(item=>item.stageId===stage.id).at(-1);return submission&&project.reviews.filter(review=>review.submissionId===submission.id).at(-1)?.decision==='ready';
  }).length;
  const heading=React.useRef<HTMLHeadingElement>(null);
  React.useEffect(()=>{heading.current?.focus({preventScroll:true});},[project.id,stage.id,step.id]);
  const active=narration.state==='playing'||narration.state==='preparing',unit=active?narration.step?.speech.units[narration.unitIndex]:undefined;
  function move(id:string){narration.stop();onStep(id);}
  function complete(){narration.stop();onCompleteView();}
  return <>
    <header className="pj-teaching-toolbar"><button aria-label="关闭项目教学" disabled={busy} onClick={()=>{narration.stop();onClose();}}>×</button>
      <nav aria-label="项目教学步骤">{steps.map((item,position)=><button key={item.id} disabled={busy} aria-label={'第'+(position+1)+'步：'+item.title} aria-current={item.id===step.id?'step':undefined} onClick={()=>move(item.id)}/>)}</nav>
      <button className="pj-teaching-count" title="统计各阶段最近提交及其人工复核；自评和AI建议不计入人工复核" onClick={complete}>已提交 {submitted}/{project.definition.stages.length} · 人工复核 {reviewed}/{project.definition.stages.length}</button>
      <button aria-label="项目朗读设置" onClick={()=>setSettings(true)}>♫</button><button onClick={()=>{if(active)narration.pause();onAssistant();}}>○ 助教</button><button onClick={complete}>完整作品</button>
    </header>
    <section className="pj-teaching-intro" aria-label="当前项目步骤"><div><select aria-label="项目阶段" disabled={busy} value={stage.id} onChange={event=>{narration.stop();onStage(event.target.value);}}>{project.definition.stages.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><span> · STEP {index+1} OF {steps.length}</span></div>
      <div className="pj-teaching-title"><h2 ref={heading} tabIndex={-1}>{step.title}</h2><button disabled={narration.loading||!narration.view?.speech.available} onClick={()=>active?narration.pause():void narration.play()}>{active?'Ⅱ 暂停':narration.state==='paused'?'▷ 继续朗读':'▷ 朗读本步骤'}</button>{narration.state!=='idle'&&<button onClick={narration.stop}>■ 停止</button>}</div>
      <p aria-live="off">{unit?<>{step.instruction.slice(0,unit.start)}<mark>{step.instruction.slice(unit.start,unit.end)}</mark>{step.instruction.slice(unit.end)}</>:step.instruction}</p>
      {narration.notice&&<p className="pj-teaching-audio-notice" role="status">{narration.notice}<button onClick={narration.reload}>重新读取朗读设置</button></p>}
      {!narration.loading&&narration.view&&!narration.view.speech.available&&<small>当前没有启用语音，可以继续阅读和完成作品。</small>}
    </section>
    <footer className="pj-teaching-navigation"><button disabled={busy||index===0} onClick={()=>move(steps[index-1].id)}>‹ 上一步</button><span>{index+1} / {steps.length}</span><button disabled={busy||index===steps.length-1} onClick={()=>move(steps[index+1].id)}>下一步 ›</button></footer>
    {settings&&<WorkspaceDialog onClose={()=>setSettings(false)}><section className="pj-dialog" role="dialog" aria-modal="true" aria-label="项目朗读设置"><header><h2>朗读设置</h2><button aria-label="关闭项目朗读设置" onClick={()=>setSettings(false)}>×</button></header>
      <label className="pj-label">朗读音色<select value={narration.voice} disabled={!narration.view?.speech.available} onChange={event=>narration.setVoice(event.target.value)}>{narration.view?.speech.voices.map(voice=><option key={voice.id} value={voice.id}>{voice.label}{voice.language?' · '+voice.language:''}</option>)}</select></label>
      <label className="pj-label">朗读速度<select value={narration.speed} onChange={event=>narration.setSpeed(Number(event.target.value))}>{[0.5,0.75,1,1.25,1.5,2].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label><p>暂停后会从当前句重新开始。切换步骤或关闭项目会停止声音。</p>
    </section></WorkspaceDialog>}
  </>;
}
