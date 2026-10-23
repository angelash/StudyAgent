'use client';
import * as React from 'react';
import { sourceCourseContentSchema, type CourseSourceSnapshot, type SourceCourseContent, type SourceCourseLessonContent } from '@study-agent/contracts';

type Section = 'teaching' | 'example' | 'questions' | 'citations';
const sections: Array<[Section, string]> = [['teaching', '讲解与板书'], ['example', '例子与误区'], ['questions', '练习与答案'], ['citations', '来源引用']];
const labels: Record<string,string> = { title:'名称',overview:'课程概览',lessons:'课时',objective:'目标',introduction:'开场',concept:'概念讲解',notes:'概念板书',example:'示例',scenario:'情境',steps:'步骤',board:'板书',conclusion:'结论',misconception:'误区',claim:'错误说法',correction:'纠正讲解',transfer:'迁移',summary:'总结',takeaways:'要点',questions:'练习',prompt:'题干',options:'选项',answer:'正确选项',explanation:'解释',hints:'帮助',citations:'引用',sourceKey:'来源页',quote:'短引文' };
const describe = (path: Array<string|number>) => path.map(part => typeof part === 'number' ? String(part+1) : labels[part]??part).join(' · ');
export function downloadTeachingDraft(content: SourceCourseContent, courseId: string, revision: number) {
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'study-agent-source-course-draft-v1',courseId,basedOnRevision:revision,contentReview:'pending',content},null,2)],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='teaching-draft-'+courseId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Field({label,path,value,max,onChange,short=false}:{label:string;path:string;value:string;max:number;onChange:(value:string)=>void;short?:boolean}) {
  return <label className="sc-editor-field"><span>{label}<small>{value.length}/{max}</small></span>{short
    ? <input aria-label={label} name={path} required maxLength={max} value={value} onChange={event=>onChange(event.target.value)}/>
    : <textarea aria-label={label} name={path} required maxLength={max} value={value} onChange={event=>onChange(event.target.value)}/>}</label>;
}
function Lines({label,path,value,min,max,length,onChange}:{label:string;path:string;value:string[];min:number;max:number;length:number;onChange:(value:string[])=>void}) {
  return <label className="sc-editor-field"><span>{label}<small>{value.length} 条</small></span><textarea aria-label={label} name={path} required value={value.join('\n')} maxLength={max*(length+1)} onChange={event=>onChange(event.target.value.split(/\r?\n/))}/><small>每行一条，共{min===max?min:min+'～'+max}条，每条最多{length}字。</small></label>;
}
export function SourceCourseContentEditor({courseId,revision,content,sources,busy,dirty,onChange,onSave,onCancel}:{courseId:string;revision:number;content:SourceCourseContent;sources:CourseSourceSnapshot[];busy:boolean;dirty:boolean;onChange:(value:SourceCourseContent)=>void;onSave:(value:SourceCourseContent)=>Promise<void>;onCancel:()=>void}) {
  const [lessonIndex,setLessonIndex]=React.useState(0),[section,setSection]=React.useState<Section>('teaching'),[issue,setIssue]=React.useState('');
  const lesson=content.lessons[lessonIndex]??content.lessons[0],prefix='lessons.'+lessonIndex+'.';
  function navigateTabs(event:React.KeyboardEvent){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=sections.findIndex(([key])=>key===section),index=event.key==='Home'?0:event.key==='End'?sections.length-1:(current+(event.key==='ArrowRight'?1:-1)+sections.length)%sections.length;const next=sections[index][0];setSection(next);document.getElementById('editor-tab-'+next)?.focus();}
  function update(value:Partial<SourceCourseLessonContent>){onChange({...content,lessons:content.lessons.map((item,index)=>index===lessonIndex?{...item,...value}:item)});setIssue('');}
  function question(index:number,value:Partial<SourceCourseLessonContent['questions'][number]>) { update({questions:lesson.questions.map((item,qi)=>qi===index?{...item,...value}:item)}); }
  async function submit(event:React.FormEvent){event.preventDefault();const parsed=sourceCourseContentSchema.safeParse(content);if(!parsed.success){
    const first=parsed.error.issues[0],path=first.path;setIssue(describe(path)+'：请核对必填内容、长度与条数。');
    if(path[0]==='lessons'&&typeof path[1]==='number'){setLessonIndex(path[1]);setSection(path[2]==='questions'?'questions':path[2]==='citations'?'citations':['example','misconception'].includes(String(path[2]))?'example':'teaching');}
    requestAnimationFrame(()=>{let name=path.join('.');while(name){const element=document.getElementsByName(name)[0];if(element instanceof HTMLElement){element.focus();element.scrollIntoView({block:'center'});break;}name=name.split('.').slice(0,-1).join('.');}});return;
  }setIssue('');await onSave(parsed.data);}
  return <form className="sc-content-editor" aria-label="完整教学稿编辑器" onSubmit={event=>void submit(event)} noValidate>
    <header className="sc-editor-heading"><div><small>TEACHING MANUSCRIPT</small><h2>逐段核对，再交给课堂。</h2><p>这里显示练习答案，供你编写与核查。修改和确认不会替代教师审核。</p></div><span role="status">{busy?'正在保存…':dirty?'有未保存修改':'与打开时的稿件一致'}</span></header>
    {issue&&<p className="sc-error" role="alert">{issue}</p>}
    <fieldset disabled={busy} className="sc-editor-course"><Field label="教学稿课程名称" path="title" value={content.title} max={180} short onChange={title=>onChange({...content,title})}/><Field label="课程概览" path="overview" value={content.overview} max={700} onChange={overview=>onChange({...content,overview})}/></fieldset>
    <div className="sc-editor-navigation"><label>正在编辑的课时<select aria-label="教学稿课时" disabled={busy} value={lessonIndex} onChange={event=>{setLessonIndex(Number(event.target.value));setIssue('');}}>{content.lessons.map((item,index)=><option key={index} value={index}>{index+1}. {item.title}</option>)}</select></label><div role="tablist" aria-label="教学稿环节" onKeyDown={navigateTabs}>{sections.map(([key,title])=><button type="button" role="tab" id={'editor-tab-'+key} aria-controls="sc-editor-panel" aria-selected={section===key} tabIndex={section===key?0:-1} key={key} disabled={busy} onClick={()=>setSection(key)}>{title}</button>)}</div></div>
    <fieldset id="sc-editor-panel" role="tabpanel" aria-labelledby={'editor-tab-'+section} disabled={busy} className="sc-editor-panel">
      {section==='teaching'&&<>
        <Field label="教学稿课时标题" path={prefix+'title'} value={lesson.title} max={100} short onChange={title=>update({title})}/>
        <Field label="教学稿课时目标" path={prefix+'objective'} value={lesson.objective} max={350} onChange={objective=>update({objective})}/>
        <Field label="开场讲解" path={prefix+'introduction'} value={lesson.introduction} max={400} onChange={introduction=>update({introduction})}/>
        <Field label="概念讲解" path={prefix+'concept'} value={lesson.concept} max={900} onChange={concept=>update({concept})}/>
        <Lines label="概念板书" path={prefix+'notes'} value={lesson.notes} min={2} max={5} length={80} onChange={notes=>update({notes})}/>
        <Field label="迁移讲解" path={prefix+'transfer'} value={lesson.transfer} max={500} onChange={transfer=>update({transfer})}/>
        <Field label="总结讲解" path={prefix+'summary'} value={lesson.summary} max={300} onChange={summary=>update({summary})}/>
        <Lines label="总结板书" path={prefix+'takeaways'} value={lesson.takeaways} min={2} max={4} length={80} onChange={takeaways=>update({takeaways})}/>
      </>}
      {section==='example'&&<>
        <div className="sc-editor-divider"><small>WORKED EXAMPLE</small><h3>把每一步讲清楚</h3><p>核对数值、条件和倍数；板书只保留关键步骤。</p></div>
        <Field label="示例情境" path={prefix+'example.scenario'} value={lesson.example.scenario} max={500} onChange={scenario=>update({example:{...lesson.example,scenario}})}/>
        <Lines label="示例讲解步骤" path={prefix+'example.steps'} value={lesson.example.steps} min={2} max={6} length={200} onChange={steps=>update({example:{...lesson.example,steps}})}/>
        <Lines label="示例板书" path={prefix+'example.board'} value={lesson.example.board} min={2} max={6} length={80} onChange={board=>update({example:{...lesson.example,board}})}/>
        <Field label="示例结论" path={prefix+'example.conclusion'} value={lesson.example.conclusion} max={350} onChange={conclusion=>update({example:{...lesson.example,conclusion}})}/>
        <div className="sc-editor-divider"><small>MISCONCEPTION</small><h3>让纠正与解释相互一致</h3></div>
        <Field label="常见错误说法" path={prefix+'misconception.claim'} value={lesson.misconception.claim} max={250} onChange={claim=>update({misconception:{...lesson.misconception,claim}})}/>
        <Field label="误区纠正讲解" path={prefix+'misconception.correction'} value={lesson.misconception.correction} max={500} onChange={correction=>update({misconception:{...lesson.misconception,correction}})}/>
        <Lines label="误区板书" path={prefix+'misconception.board'} value={lesson.misconception.board} min={2} max={3} length={80} onChange={board=>update({misconception:{...lesson.misconception,board}})}/>
      </>}
      {section==='questions'&&<><div className="sc-editor-divider"><small>PRACTICE & ANSWERS</small><h3>检查每个答案与两级帮助</h3><p>每题应有唯一正确项；帮助逐步展开，不能把前后计算写成不同结果。</p></div>{lesson.questions.map((item,qi)=><section className="sc-editor-question" key={qi} aria-label={'编辑第'+(qi+1)+'题'}><header><h4>练习 {qi+1}</h4><button type="button" disabled={lesson.questions.length<=2} onClick={()=>update({questions:lesson.questions.filter((_,index)=>index!==qi)})}>移除此题</button></header>
        <Field label={'第'+(qi+1)+'题题干'} path={prefix+'questions.'+qi+'.prompt'} value={item.prompt} max={700} onChange={prompt=>question(qi,{prompt})}/>
        <fieldset className="sc-editor-options"><legend>四个选项 · 勾选正确答案</legend>{item.options.map((option,oi)=><div key={oi} data-correct={item.answer===oi}><label className="sc-editor-answer"><input type="radio" name={prefix+'questions.'+qi+'.answer'} aria-label={'第'+(qi+1)+'题正确选项'+String.fromCharCode(65+oi)} checked={item.answer===oi} onChange={()=>question(qi,{answer:oi})}/><b>{String.fromCharCode(65+oi)}</b></label><Field label={'第'+(qi+1)+'题选项'+String.fromCharCode(65+oi)} path={prefix+'questions.'+qi+'.options.'+oi} value={option} max={220} onChange={value=>question(qi,{options:item.options.map((text,index)=>index===oi?value:text)})}/></div>)}</fieldset>
        <Field label={'第'+(qi+1)+'题解释'} path={prefix+'questions.'+qi+'.explanation'} value={item.explanation} max={600} onChange={explanation=>question(qi,{explanation})}/>
        <Lines label={'第'+(qi+1)+'题两级帮助'} path={prefix+'questions.'+qi+'.hints'} value={item.hints} min={2} max={2} length={200} onChange={hints=>question(qi,{hints})}/>
      </section>)}<button type="button" disabled={lesson.questions.length>=4} onClick={()=>update({questions:[...lesson.questions,{prompt:'',options:['','','',''],answer:0,explanation:'',hints:['','']}]})}>＋ 添加练习</button></>}
      {section==='citations'&&<><div className="sc-editor-divider"><small>CHECK AGAINST THE SOURCE</small><h3>让引用可以回到原页</h3><p>短引文需要在所选原页逐字找到。核对引用存在不等于整课学科内容已审核。</p></div>{lesson.citations.map((citation,ci)=><section className="sc-editor-citation" key={ci}><label>引用 {ci+1} 的原页<select name={prefix+'citations.'+ci+'.sourceKey'} value={citation.sourceKey} onChange={event=>update({citations:lesson.citations.map((item,index)=>index===ci?{...item,sourceKey:event.target.value}:item)})}>{sources.map(source=><option key={source.key} value={source.key}>{source.title} · 第{source.page}{source.kind==='text'?'段':'页'}</option>)}</select></label><Field label={'引用'+(ci+1)+'短引文'} path={prefix+'citations.'+ci+'.quote'} value={citation.quote} max={500} onChange={quote=>update({citations:lesson.citations.map((item,index)=>index===ci?{...item,quote}:item)})}/><details><summary>对照这页冻结正文</summary><pre>{sources.find(source=>source.key===citation.sourceKey)?.text??'来源不可用'}</pre></details><button type="button" disabled={lesson.citations.length<=1} onClick={()=>update({citations:lesson.citations.filter((_,index)=>index!==ci)})}>移除此引用</button></section>)}<button type="button" disabled={lesson.citations.length>=5} onClick={()=>update({citations:[...lesson.citations,{sourceKey:sources[0].key,quote:''}]})}>＋ 添加来源引用</button></>}
    </fieldset>
    <footer className="sc-editor-save"><div><small>保存后重新审阅，确认仍是独立一步。</small><span>内容核查中 · 不作为正式能力测量</span></div><div><button type="button" disabled={busy} onClick={()=>downloadTeachingDraft(content,courseId,revision)}>导出本地编辑稿</button><button type="button" disabled={busy} onClick={onCancel}>返回蓝图</button><button className="sc-primary" disabled={busy}>{busy?'正在保存教学稿…':'保存教学内容'}</button></div></footer>
  </form>;
}
