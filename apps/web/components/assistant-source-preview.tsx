'use client';
import * as React from 'react';
import Link from 'next/link';
import type { AssistantSourcePreview, AssistantTeachingBlock, AssistantContextView, AssistantLocation } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../lib/api';
import { internalAssistantHref } from '../lib/assistant-course-navigation';
import { useOriginalTeachingFonts } from '../lib/original-teaching-fonts';
import { ClassroomFigure } from '../app/studio/classroom/diagram';
import { ClassroomImage } from '../app/studio/classroom/classroom-image';
import './assistant-source-preview.css';

type Props = { ownerId: string; search: string };
const sourceInterfaceText = 'TEACHING SOURCE 当时的教学出处 返回原对话 打开当前课程 返回学习页面 保留本次回答使用的教学内容与范围。教学字体暂未读回。重新准备字体 正在读取原会话保存的教学出处… 重新读取出处 与当前教学版本一致 保留的原教学版本 · 当前课程已变化 · 当时为待核对教案 第 页 来源版本 本次问答带入 个知识目标、个教学条目。下面显示与这条出处相关的 个条目。这是本课使用的资料短摘与相关讲解。讲解中的全部内容仍需结合原资料核对。原问答使用图片的文字说明 图形完整标注 原教学代码 示意尺度 · 非统计数据 原图暂时无法核对，已保留当时的完整说明。放大图片 关闭图片';
function validate(value: AssistantSourcePreview, sessionId: string, key: string) {
  if (!value || !value.reference || value.reference.key !== key || !/^[a-f0-9]{64}$/.test(value.reference.contextFingerprint) || typeof value.current !== 'boolean' ||
    !['teaching-sections', 'lesson-citation'].includes(value.scope) || !Array.isArray(value.sections) || value.sections.length > 2000 ||
    !value.sections.every(part => typeof part.title === 'string' && Array.isArray(part.blocks)) || !value.coverage || !value.selection) return false;
  const href = internalAssistantHref(value.reference.href); if (!href) return false;
  const query = new URL(href, 'https://study.invalid').searchParams;
  return query.get('assistantSourceSession') === sessionId && query.get('assistantSourceKey') === key;
}

export function AssistantSourcePreviewPanel({ ownerId, search }: Props) {
  const query = React.useMemo(() => new URLSearchParams(search), [search]), id = query.get('assistantSourceSession') ?? '', sourceKey = query.get('assistantSourceKey') ?? '';
  const identity = JSON.stringify([ownerId, id, sourceKey, query.get('student')??query.get('studentId'),query.get('subject')]);
  const [read, setRead] = React.useState<{ identity: string; value?: AssistantSourcePreview; error?: string; switchHref?:string; location?:AssistantLocation }>({ identity: '' });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController(); setRead({ identity });
    if (!id || id.length > 180 || !sourceKey || sourceKey.length > 100) { setRead({ identity, error: '出处链接不完整，请从已保存回答重新打开。' }); return; }
    void Promise.all([apiRequest<AssistantSourcePreview>('/ai/assistant/sessions/' + encodeURIComponent(id) + '/sources/' + encodeURIComponent(sourceKey), { signal: controller.signal }),
      apiRequest<AssistantContextView>('/ai/assistant/sessions/'+encodeURIComponent(id)+'/context',{signal:controller.signal})]).then(([value,context]) => {
      if (controller.signal.aborted) return;
      if (!validate(value, id, sourceKey)) throw Error('出处与原会话不匹配，请保留原对话并重新核对。');
      const l=context.location,r=value.reference;
      if(l.sessionId!==id||l.contextRefType!==r.kind||l.contextRefId!==r.courseId+'@'+r.contextFingerprint||l.contextItemId!==r.itemId)throw Error('出处与原课程身份不匹配。');
      const requestedStudent=query.get('student')??query.get('studentId'),requestedSubject=query.get('subject');
      if(l.pageContext==='course'&&(requestedStudent!==null&&requestedStudent!==(l.studentId??'')||requestedSubject!==null&&l.subject!==null&&requestedSubject!==l.subject)){
        const q=new URLSearchParams(search);q.delete('studentId');if(l.studentId)q.set('student',l.studentId);else q.delete('student');if(l.subject)q.set('subject',l.subject);else q.delete('subject');
        setRead({identity,error:'当前学习档案或学科与这条出处不一致。',switchHref:'/studio?'+q});return;
      }
      if(l.pageContext==='course'){
        const current=new URLSearchParams(window.location.search);
        if(current.get('assistantSourceSession')!==id||current.get('assistantSourceKey')!==sourceKey)return;
        let changed=false;
        if(!current.has('student')&&!current.has('studentId')&&l.studentId){current.set('student',l.studentId);changed=true;}
        if(!current.has('subject')&&l.subject){current.set('subject',l.subject);changed=true;}
        if(!l.studentId&&current.get('courseScope')!=='adult'){current.set('courseScope','adult');changed=true;}
        if(changed){window.history.replaceState(null,'','/studio?'+current+window.location.hash);window.dispatchEvent(new PopStateEvent('popstate'));}
      }
      setRead({ identity, value,location:l });
    }).catch(error => { if (!controller.signal.aborted) setRead({ identity, error: error instanceof ApiRequestError && [403, 404].includes(error.status)
      ? '当前账号无法读取这条出处。请从自己的已保存回答重新打开。' : error.message }); });
    return () => controller.abort();
  }, [identity, id, sourceKey, attempt]);
  const value = read.identity === identity ? read.value : undefined, error = read.identity === identity ? read.error : undefined;
  const fonts = useOriginalTeachingFonts('assistant-source:' + identity, sourceInterfaceText + JSON.stringify(value ?? {}) + (error ?? ''), 'standard');
  const original = React.useMemo(() => {
    const next = new URLSearchParams(value?.reference.href.split('?')[1]??search), message = query.get('assistantSourceMessage');
    for (const key of ['assistantSourceSession', 'assistantSourceKey', 'assistantSourceMessage']) next.delete(key);
    next.set('view', 'home'); next.set('mode', 'instant');
    if(value&&read.location?.pageContext==='course'){next.set('courseSelection',JSON.stringify(value.selection));if(read.location.studentId)next.set('student',read.location.studentId);else next.set('courseScope','adult');if(read.location.subject)next.set('subject',read.location.subject);}
    return '/studio?' + next + (message && message.length <= 180 ? '#assistant-message-' + encodeURIComponent(message) : '');
  }, [search,value,read.location]);
  return <section className="assistant-source-panel" aria-labelledby="assistant-source-title" data-original-font-status={fonts.ready ? 'ready' : fonts.error ? 'error' : 'loading'}>
    <header><small>TEACHING SOURCE</small><h1 id="assistant-source-title">当时的教学出处</h1><p>保留本次回答使用的教学内容与范围。</p></header>
    <nav aria-label="出处返回">{value ? <a href={original}>返回原对话</a> : <Link href="/learn">返回学习页面</Link>}{value?.reference.originHref && internalAssistantHref(value.reference.originHref) && <Link href={value.reference.originHref}>打开当前课程 ↗</Link>}</nav>
    {fonts.error && <p role="status">教学字体暂未读回。<button type="button" onClick={fonts.retry}>重新准备字体</button></p>}
    {error ? <div className="assistant-source-error" role="alert" aria-label="出处读取失败"><p>{error}</p>{read.identity===identity&&read.switchHref&&<a href={read.switchHref}>切回课程档案</a>}<button onClick={() => setAttempt(n => n + 1)}>重新读取出处</button></div> : !value ? <p role="status">正在读取原会话保存的教学出处…</p> : <>
      <div className="assistant-source-identity"><h2>{value.reference.title}</h2><p>{value.current ? '与当前教学版本一致' : '保留的原教学版本 · 当前课程已变化'}{value.accessMode === 'authoring' ? ' · 当时为待核对教案' : ''}</p>
        <small>{value.reference.page ? '第 ' + value.reference.page + ' 页 · ' : ''}{value.reference.sourceVersion ? '来源版本 ' + value.reference.sourceVersion : ''}</small>
        {value.reference.quote && <blockquote>{value.reference.quote}</blockquote>}
        <p className="assistant-source-scope">本次问答带入 {value.coverage.includedTargets} / {value.coverage.totalTargets} 个知识目标、{value.coverage.includedParts} / {value.coverage.totalParts} 个教学条目。下面显示与这条出处相关的 {value.sections.length} 个条目。</p>
        {value.scope === 'lesson-citation' && <p>这是本课使用的资料短摘与相关讲解。讲解中的全部内容仍需结合原资料核对。</p>}
      </div>
      <section aria-label="冻结教学内容" className="assistant-source-content">{value.sections.map(part => <article key={part.key}><h3>{part.title}</h3>{part.blocks.map((block, index) => <SourceBlock key={index} block={block} heading={part.title}/>)}</article>)}</section>
    </>}
  </section>;
}

function SourceBlock({ block, heading }: { block: AssistantTeachingBlock; heading: string }) {
  return <div className={'assistant-source-block source-block-' + block.kind}>
    {block.text && block.text !== heading && <p>{block.text}</p>}
    {block.items && <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    {block.table && <div className="assistant-source-table"><table><thead><tr>{block.table.headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{block.table.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {block.diagram && <><ClassroomFigure diagram={block.diagram}/><ul aria-label="图形完整标注">{block.diagram.labels.map((label, index) => <li key={index}>{label}{block.diagram?.captions?.[index] && ' · ' + block.diagram.captions[index]}</li>)}</ul></>}
    {block.code !== undefined && <pre tabIndex={0} aria-label="原教学代码"><code>{block.code}</code></pre>}
    {block.figure && <SourceFigure figure={block.figure}/>}
  </div>;
}

function SourceFigure({ figure }: { figure: NonNullable<AssistantTeachingBlock['figure']> }) {
  const asset = figure.asset;
  const verified = asset?.status === 'verified' && typeof asset.href === 'string' && typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256) && /^\/classroom\/chemistry-v2\/[a-z][a-z0-9-]*\.svg$/.test(asset.href);
  return <>{verified ? <ClassroomImage image={{ src: asset.href, alt: figure.alt, caption: figure.caption }}/> : null}
    <figure><p>{figure.alt}</p>{asset && !verified && <p role="status">原图暂时无法核对，已保留当时的完整说明。</p>}
      <figcaption>{verified ? '原问答使用图片的文字说明' : figure.caption + ' · 原问答使用图片的文字说明'}</figcaption></figure></>;
}
