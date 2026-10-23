import type { CourseSourceSnapshot, SourceCourseContent } from '@study-agent/contracts';

export function OriginalManuscript({content,sources}:{content:SourceCourseContent;sources:CourseSourceSnapshot[]}){
  return <details className="sc-original-manuscript"><summary>对照首次生成稿</summary><h3>{content.title}</h3><p>{content.overview}</p>{content.lessons.map((lesson,index)=><details key={index}><summary>{index+1}. {lesson.title}</summary>
    <p><b>目标：</b>{lesson.objective}</p><h4>开场与概念</h4><p>{lesson.introduction}</p><p>{lesson.concept}</p><ul>{lesson.notes.map((point,pi)=><li key={pi}>{point}</li>)}</ul>
    <h4>逐步示例</h4><p>{lesson.example.scenario}</p><ol>{lesson.example.steps.map((step,si)=><li key={si}>{step}</li>)}</ol><ul>{lesson.example.board.map((point,pi)=><li key={pi}>{point}</li>)}</ul><p>{lesson.example.conclusion}</p>
    <h4>误区纠正</h4><p>{lesson.misconception.claim}</p><p>{lesson.misconception.correction}</p><ul>{lesson.misconception.board.map((point,pi)=><li key={pi}>{point}</li>)}</ul>
    <h4>迁移与总结</h4><p>{lesson.transfer}</p><p>{lesson.summary}</p><ul>{lesson.takeaways.map((point,pi)=><li key={pi}>{point}</li>)}</ul>
    <h4>练习与原始答案</h4>{lesson.questions.map((question,qi)=><article key={qi}><b>第{qi+1}题</b><p>{question.prompt}</p><ol type="A">{question.options.map((option,oi)=><li key={oi}>{option}{question.answer===oi?' · 原稿正确项':''}</li>)}</ol><p>解释：{question.explanation}</p><ol>{question.hints.map((hint,hi)=><li key={hi}>{hint}</li>)}</ol></article>)}
    <h4>引用原页</h4>{lesson.citations.map((citation,ci)=>{const source=sources.find(item=>item.key===citation.sourceKey);return <article key={ci}><b>{source?source.title+' · 第'+source.page+(source.kind==='text'?'段':'页'):'来源待核对'}</b><blockquote>{citation.quote}</blockquote></article>;})}
  </details>)}</details>;
}
