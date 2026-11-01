'use client';
import * as React from 'react';
import type { KnowledgeAtom } from '@study-agent/contracts';
import type { TeachingEditorDraft, TeachingEditorOwner } from '../../../lib/teaching-editor-copy';
import { useTeachingEditorWorkspace } from '../../../lib/use-teaching-editor-workspace';
import { TeachingPackageContent } from './teaching-package-content';
import { WorkspaceDialog } from '../../studio/workspace-dialog';
import './teaching-package.css';

const sections = { source: '来源与引用', goals: '目标与先修', explanation: '讲解与例题', visuals: '图示与演示', checks: '检查材料', summary: '迁移与总结', versions: '版本与发布' };
const uses = { activation: '激活', concept: '概念', example: '例题', visual: '图示', misconception: '错因核查', check: '检查', transfer: '迁移', summary: '总结', retention: '保持' };
const contentNames = { title: '标题', goals: '目标与标准', prerequisites: '先修回顾', activation: '开始观察', concept: '概念讲解', example: '分步例题', visuals: '图示与演示', misconceptions: '错因与替代解释', checks: '检查安排', transfer: '迁移', summary: '总结', retention: '保持安排', citations: '引用依据' };
const fieldNames: Record<string, string> = { atomId: '知识点', objective: '目标', successCriterion: '达到目标的表现', rationale: '依据', prompt: '任务', expectedObservation: '预期观察', bridge: '联系目标', explanation: '讲解', points: '关键关系', situation: '情境', steps: '步骤', board: '同步板书', conclusion: '结论', kind: '呈现方式', title: '标题', diagram: '图形', labels: '标注', values: '示意数值', captions: '补充说明', headers: '表头', rows: '表格正文', experiment: '演示', prediction: '预测', question: '问题', options: '可选预测', observation: '观察', limitation: '模型与操作边界', alternatives: '替代解释', verification: '区分方法', correctiveFeedback: '纠正反馈', purpose: '用途', instructions: '完成方法', materials: '材料', scenario: '新情境', expectedStrategy: '策略', synthesis: '总结', takeaways: '带走的关系', intervalDays: '间隔天数', anchor: '间隔锚点', page: 'PDF物理页', quote: '依据短引', usedFor: '用于' };
const valueNames: Record<string, string> = { understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持', last_relevant_teaching_or_help: '最后一次相关教学或帮助', diagram: '关系图', table: '表格', experiment: '演示', not_applicable: '不适用' };
function ReadValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return value.length ? <ol>{value.map((item, index) => <li key={index}><ReadValue value={item} /></li>)}</ol> : <p>尚未填写</p>;
  if (value !== null && typeof value === 'object') return <dl>{Object.entries(value).filter(([key]) => key !== 'id').map(([key, item]) => <React.Fragment key={key}><dt>{fieldNames[key] ?? key}</dt><dd><ReadValue value={item} /></dd></React.Fragment>)}</dl>;
  return <span>{valueNames[String(value)] ?? (String(value ?? '') || '尚未填写')}</span>;
}
function Upload({ label, onFile, disabled = false }: { label: string; onFile: (file: File) => void; disabled?: boolean }) {
  return <label className="teaching-package-upload">{label}<input type="file" accept="application/json,.json" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} /></label>;
}

export function TeachingPackageWorkspace({ owner, lessonName, atoms, range, onPage, onAccessChange }: {
  owner: TeachingEditorOwner; lessonName: string; atoms: KnowledgeAtom[]; range?: { start: number; end: number }; onPage: (page: number) => void; onAccessChange: (denied: boolean) => void;
}) {
  const desk = useTeachingEditorWorkspace(owner, range), copy = desk.copy, [serverVersion, setServerVersion] = React.useState(''), [confirmClear, setConfirmClear] = React.useState(false);
  React.useEffect(() => { onAccessChange(desk.denied); }, [desk.denied, onAccessChange]);
  const locked = Boolean(desk.busy), selectedPage = copy?.source?.pages.find(page => page.page === copy.editor.activeSourcePage) ?? copy?.source?.pages[0];
  function page(number: number) { desk.editReview(value => { value.editor.activeSourcePage = number; }); onPage(number); }
  function reviewPage(recipe: (value: NonNullable<TeachingEditorDraft['sourceReview']['pages'][number]>) => void) {
    if (!selectedPage) return; desk.edit(value => {
      let record = value.sourceReview.pages.find(item => item.page === selectedPage.page);
      if (!record) { record = { page: selectedPage.page, visualChecked: false, statement: '' }; value.sourceReview.pages.push(record); }
      recipe(record);
    });
  }
  const currentReview = copy?.sourceReview.pages.find(item => item.page === selectedPage?.page);
  if (desk.denied) return <section className="curriculum-teaching-package" aria-label="教学稿权限已变化"><h4>原教学稿已隐藏</h4><p>当前登录身份或教研授权已改变。完整输入仍按原账号保留；请登录原教研账号后重新核对。</p>
    {desk.error && <p className="studio-error" role="alert">{desk.error}</p>}<button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.resumeIdentity()}>重新核对原教研账号</button></section>;
  return <section className="curriculum-teaching-package" aria-label="教材课时完整教学稿" aria-busy={locked}>
    <div className="teaching-package-heading"><div><span className="studio-eyebrow">课时教学 · 完整稿</span><h4>{lessonName}</h4><p>先逐页核对来源，再写出完整讲解、例题、图示与检查安排。保存稿与正式发布分别确认。</p></div>
      <button type="button" className="studio-text-button" disabled={locked} onClick={() => desk.fork()}>新建独立教学稿</button></div>
    {desk.error && <p className="studio-error" role="alert">{desk.error}</p>}{desk.notice && <p role="status" className="studio-hint">{desk.notice}</p>}
    <p className="teaching-package-storage" role="status">{desk.storage}</p>
    <div className="teaching-package-copy-controls"><Upload label="导入完整教学稿" disabled={locked} onFile={file => void desk.importCopy(file)} />
      {copy && <><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.download()}>下载当前完整稿</button><Upload label="读回下载副本" disabled={locked} onFile={file => void desk.importCopy(file, true)} />
        <button type="button" className="studio-text-button" disabled={locked} onClick={() => desk.fork(copy)}>保留内容另开本机稿</button></>}
      {!desk.ready && <button type="button" className="studio-text-button" disabled={locked} onClick={desk.retryLocal}>重新读取本机稿</button>}</div>
    {!copy && <p>正在核对本账号、教材版本与课时的完整本机稿。原记录无法读取时，可明确新建或导入另一份稿。</p>}
    {copy && <>
      <nav className="teaching-package-sections" aria-label="完整教学稿章节">{Object.entries(sections).map(([section, label]) => <button type="button" key={section} aria-pressed={copy.editor.section === section} disabled={locked} onClick={() => desk.editReview(value => { value.editor.section = section as TeachingEditorDraft['editor']['section']; })}>{label}</button>)}</nav>
      {copy.editor.section === 'source' && <fieldset className="teaching-package-source" disabled={locked}><legend>完整范围、逐页审核与引用</legend>
        <div className="admin-form"><label>PDF物理起始页<input inputMode="numeric" value={copy.range.start} maxLength={30} onChange={event => desk.edit(value => { value.range.start = event.target.value; })} /></label>
          <label>PDF物理结束页<input inputMode="numeric" value={copy.range.end} maxLength={30} onChange={event => desk.edit(value => { value.range.end = event.target.value; })} /></label></div>
        <button type="button" className="studio-secondary" onClick={() => void desk.sourcePreview()}>核对这个完整范围</button>
        {desk.sourceCandidate && <div className="studio-hint"><p>核对到的来源与原稿不同。原完整来源、逐页记录和正文会保留在原本机稿中。</p><button type="button" className="studio-secondary" onClick={desk.useSourceCandidate}>采用新来源另开本机稿</button></div>}
        {copy.source && <><p>{copy.source.edition} · {copy.source.bookTitle} · PDF物理页{copy.source.pageStart}～{copy.source.pageEnd}</p>
          <label className="curriculum-inline-check"><input type="checkbox" checked={copy.sourceReview.confirmedRange} onChange={event => desk.edit(value => { value.sourceReview.confirmedRange = event.target.checked; })} />已对照原卷核对本课完整起止范围</label>
          <label>范围依据与限制<textarea aria-label="范围依据与限制" rows={3} maxLength={2000} value={copy.sourceReview.statement} onChange={event => desk.edit(value => { value.sourceReview.statement = event.target.value; })} /></label>
          <div className="admin-toolbar"><label>逐页核对<select value={selectedPage?.page ?? ''} onChange={event => page(Number(event.target.value))}>{copy.source.pages.map(item => <option key={item.page} value={item.page}>PDF物理页{item.page}{copy.sourceReview.pages.find(review => review.page === item.page)?.visualChecked ? ' · 已勾选原图核对' : ' · 待核对'}</option>)}</select></label>
            <button type="button" className="studio-text-button" disabled={!selectedPage || selectedPage.page <= copy.source.pageStart} onClick={() => selectedPage && page(selectedPage.page - 1)}>上一原页</button><button type="button" className="studio-text-button" disabled={!selectedPage || selectedPage.page >= copy.source.pageEnd} onClick={() => selectedPage && page(selectedPage.page + 1)}>下一原页</button></div>
          {selectedPage && <><div className="teaching-package-source-text" tabIndex={0} aria-label={`PDF物理页${selectedPage.page}完整提取文字`}>{selectedPage.text || '本页没有可读提取文字，请核对原卷图像。'}</div><p>本页完整提取文字{selectedPage.textCharacters}字符；提取文字不能代替原图审核。</p>
            <label className="curriculum-inline-check"><input type="checkbox" checked={currentReview?.visualChecked ?? false} onChange={event => reviewPage(value => { value.visualChecked = event.target.checked; })} />我已对照本页原图核对文字、图表与边界</label>
            <label>本页审核依据<textarea aria-label="本页审核依据" rows={3} maxLength={1000} value={currentReview?.statement ?? ''} onChange={event => reviewPage(value => { value.statement = event.target.value; })} /></label></>}
          <details><summary>原来源版本依据</summary><dl><dt>教材版本</dt><dd>{copy.source.bookVersion}</dd><dt>原卷指纹</dt><dd><code>{copy.source.sourceSha256}</code></dd><dt>提取文件指纹</dt><dd><code>{copy.source.extractedSha256}</code></dd></dl></details>
        </>}
        <h4>教学内容的短引依据</h4><p>逐段说明引用用于哪里。学生课堂只保留来源定位和原创教学。</p>
        {copy.content.citations.map((citation, index) => <fieldset key={index}><legend>依据{index + 1}</legend><div className="admin-form"><label>PDF物理页<select value={citation.page} onChange={event => desk.edit(value => { value.content.citations[index].page = Number(event.target.value); })}>{[...new Set([citation.page, ...(copy.source?.pages.map(item => item.page) ?? [])])].sort((a, b) => a - b).map(number => <option key={number} value={number}>{number}</option>)}</select></label>
          <label>用于<select value={citation.usedFor} onChange={event => desk.edit(value => { value.content.citations[index].usedFor = event.target.value as typeof citation.usedFor; })}>{Object.entries(uses).map(([use, label]) => <option key={use} value={use}>{label}</option>)}</select></label></div>
          <label>与原文一致的必要短引<textarea aria-label="与原文一致的必要短引" rows={3} maxLength={500} value={citation.quote} onChange={event => desk.edit(value => { value.content.citations[index].quote = event.target.value; })} /></label>
          <button type="button" className="studio-text-button" onClick={() => desk.edit(value => { value.content.citations.splice(index, 1); })}>移除此引用</button></fieldset>)}
        <button type="button" className="studio-secondary" disabled={!copy.source || copy.content.citations.length >= 40} onClick={() => desk.edit(value => { value.content.citations.push({ page: selectedPage?.page ?? value.source!.pageStart, quote: '', usedFor: 'concept' }); })}>增加一段依据</button>
        {copy.sourceHistory.length > 0 && <details><summary>保留的完整来源历史 · {copy.sourceHistory.length}份</summary>{copy.sourceHistory.map((source, index) => <details key={index}><summary>{source.bookTitle} · PDF物理页{source.pageStart}～{source.pageEnd}</summary>{source.pages.map(item => <div key={item.page}><strong>PDF物理页{item.page}</strong><p className="teaching-package-source-text">{item.text}</p></div>)}</details>)}</details>}
      </fieldset>}
      {!['source', 'versions'].includes(copy.editor.section) && <TeachingPackageContent copy={copy} atoms={atoms} catalogs={desk.catalogs} locked={locked} onEdit={desk.edit} onTarget={(atomId, selected) => void desk.target(atomId, selected)} onMaterialPage={(atomId, page) => void desk.materialPage(atomId, page)} onError={desk.setError} />}
      {copy.editor.section === 'versions' && <div className="teaching-package-versions"><h4>当前编辑基准</h4><p>{copy.baseline ? `从内容v${copy.baseline.contentVersion}复制，核对的包头修订号为${copy.baseline.header.revision}。${desk.baselineVerified ? '已向服务器核对。' : '仍须向服务器核对。'}` : '尚未保存首个服务器内容版本。'}</p>
        {copy.baseline && <><p>{copy.baseline.header.published ? `当前发布内容v${copy.baseline.header.published.contentVersion}` : '当前没有供新课程采用的发布版本'}；已创建课程保留原来采用的教学。</p>
          <button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.verifyBaseline()}>核对原内容版本与当前修订</button></>}
        <h4>完整原操作与回执</h4>{!copy.journal.length && <p>还没有保存、发布或撤回命令。</p>}{copy.journal.map(entry => <article key={entry.input.requestKey}><strong>{{ save: '保存稿', publish: '发布版本', withdraw: '撤回发布' }[entry.input.action]} · {desk.verifiedRequests.includes(entry.input.requestKey) ? '服务器原回执已核对' : '仍须核对原回执'}</strong>
          <p>{entry.message || (entry.result ? `原回执对应内容v${entry.result.affectedVersion}、修订号${entry.result.revision}` : '尚未取得完整原回执；原请求仍可能稍后完成。')}</p><div className="admin-toolbar"><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.resume(entry)}>查询完整原回执</button><button type="button" className="studio-text-button" disabled={locked} onClick={() => void desk.resume(entry, true)}>以同一份原命令恢复</button></div>
          <details><summary>准确原命令与回执</summary><pre>{JSON.stringify(entry, null, 2)}</pre></details></article>)}
        <h4>这个教材课时的服务器教学稿</h4><button type="button" className="studio-text-button" disabled={locked} onClick={() => void desk.refreshDirectory(desk.directory.page)}>刷新版本目录</button>
        {!desk.directory.items.length && <p>本账号在此课时还没有服务器教学稿。</p>}{desk.directory.items.map(item => <article key={item.id}><strong>内容v{item.contentVersion} · 修订{item.revision}{item.id === copy.packageId && ' · 当前包'}</strong><p>{item.availability.message}</p><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.compare(item.id)}>比较最新保存稿</button></article>)}
        <div className="admin-toolbar"><button type="button" className="studio-text-button" disabled={locked || desk.directory.page <= 1} onClick={() => void desk.refreshDirectory(desk.directory.page - 1)}>上一页教学稿</button><span>{desk.directory.page} / {Math.max(1, Math.ceil(desk.directory.total / desk.directory.pageSize))}</span><button type="button" className="studio-text-button" disabled={locked || desk.directory.page * desk.directory.pageSize >= desk.directory.total} onClick={() => void desk.refreshDirectory(desk.directory.page + 1)}>下一页教学稿</button></div>
        {desk.comparison && <section className="teaching-package-comparison" aria-label="本机与服务器稿比较"><h4>服务器内容v{desk.comparison.version.contentVersion}与当前本机稿</h4><p>服务器当前包头修订{desk.comparison.header.revision}；复制基准{desk.comparison.version.basedOn ? `内容v${desk.comparison.version.basedOn.contentVersion}` : '首稿'}。</p>
          <div className="admin-toolbar"><label>其他准确内容版本<input inputMode="numeric" maxLength={4} value={serverVersion} onChange={event => setServerVersion(event.target.value)} /></label><button type="button" className="studio-secondary" disabled={locked || !/^[1-9]\d{0,2}$|^1000$/.test(serverVersion)} onClick={() => void desk.compare(desk.comparison!.header.id, Number(serverVersion))}>读取该版本比较</button></div>
          {Object.entries(contentNames).map(([field, label]) => { const key = field as keyof TeachingEditorDraft['content'], before = desk.comparison!.version.body.content[key], after = copy.content[key], same = JSON.stringify(before) === JSON.stringify(after);
            return <details key={field}><summary>{label} · {same ? '内容一致' : '内容不同'}</summary><div className="teaching-package-compare-columns"><section><strong>服务器保存稿</strong><ReadValue value={before} /></section><section><strong>当前本机稿</strong><ReadValue value={after} /></section></div></details>;
          })}
          <details><summary>来源与目标版本、逐页审核</summary><div className="teaching-package-compare-columns"><section><strong>服务器来源与审核</strong><p>PDF物理页{desk.comparison.source.pageStart}～{desk.comparison.source.pageEnd}</p><ReadValue value={desk.comparison.version.body.sourceReview} /></section><section><strong>本机来源与审核</strong><p>PDF物理页{copy.range.start}～{copy.range.end}</p><ReadValue value={copy.sourceReview} /></section></div></details>
          <div className="admin-toolbar"><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.openComparison()}>从此保存版本另开本机稿</button>
            {copy.baseline && desk.comparison.header.id === copy.packageId && desk.comparison.version.contentVersion === copy.baseline.contentVersion && <button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.confirmRebase()}>已比较，按当前修订继续</button>}</div>
          <h4>该保存稿的材料与正文缺口</h4>{desk.comparison.version.report.gaps.length ? <ul>{desk.comparison.version.report.gaps.map((gap, index) => <li key={index}>{gap.message}</li>)}</ul> : <p>保存时预检没有发现发布缺口；发布时仍重新核对当前来源与材料。</p>}
        </section>}
        <fieldset disabled={locked}><legend>明确发布或撤回</legend><p>发布只采用已保存且核对过的准确内容版本。修订稿保存后，原发布版本仍继续供新课程采用，直到明确发布新版。</p>
          <label className="curriculum-inline-check"><input type="checkbox" checked={copy.editor.reviewed} onChange={event => desk.editReview(value => { value.editor.reviewed = event.target.checked; })} />已逐段核对讲解、图示、材料及逐页来源依据</label>
          <label className="curriculum-inline-check"><input type="checkbox" checked={copy.editor.originalTeaching} onChange={event => desk.editReview(value => { value.editor.originalTeaching = event.target.checked; })} />确认学生版本采用原创教学，并遵守来源与必要短引边界</label>
          <label>本次发布依据<textarea aria-label="本次发布依据" rows={3} maxLength={2000} value={copy.editor.publishReason} onChange={event => desk.editReview(value => { value.editor.publishReason = event.target.value; })} /></label><button type="button" className="studio-primary" disabled={!copy.baseline || !copy.editor.reviewed || !copy.editor.originalTeaching || copy.editor.publishReason.trim().length < 20} onClick={() => void desk.publish()}>发布已核对的内容{copy.baseline ? `v${copy.baseline.contentVersion}` : '版本'}</button>
          <label>撤回当前发布版本的原因<textarea aria-label="撤回当前发布版本的原因" rows={3} maxLength={2000} value={copy.editor.withdrawReason} onChange={event => desk.editReview(value => { value.editor.withdrawReason = event.target.value; })} /></label><button type="button" className="studio-secondary" disabled={!copy.baseline?.header.published || copy.editor.withdrawReason.trim().length < 10} onClick={() => void desk.withdraw()}>撤回当前发布，保留已采用课程</button>
        </fieldset>
      </div>}
      <div className="teaching-package-save"><button type="button" className="studio-primary" disabled={locked} onClick={() => void desk.save()}>保存完整教学稿</button><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.preflight()}>核对当前稿缺口</button><button type="button" className="studio-text-button" disabled={locked} onClick={() => setConfirmClear(true)}>清空这一份本机稿</button>{locked && <span role="status">{desk.busy}…</span>}</div>
      {desk.report && <section className="teaching-package-report" aria-label="当前稿预检"><h4>当前稿的正文与材料预检</h4>{desk.report.value.publishable ? <p>当前预检没有发现发布缺口；请先保存，再明确发布准确版本。</p> : <ul>{desk.report.value.gaps.map((gap, index) => <li key={index}>{gap.message}</li>)}</ul>}{desk.report.value.coverage.map(item => <p key={item.atomId}>{atoms.find(atom => atom.id === item.atomId)?.name ?? '原目标'}：{item.ready ? '材料配置齐备' : item.gaps.join('；')}。保持储备：{item.retentionStock.map(stock => `${stock.intervalDays}日${stock.ready ? '已配置' : '待补'}（${stock.questions}题）`).join(' · ')}。</p>)}</section>}
    </>}
    {desk.leaving && <WorkspaceDialog onClose={() => desk.setLeaving(null)}><section className="workspace-material-dialog" role="dialog" aria-modal="true" aria-label="先保留完整教学稿"><h2>先保留最新完整稿</h2><p>本机存储尚未保留最新输入。请下载完整副本，再读回文件核对后继续切换。</p><div className="workspace-page-controls"><button type="button" className="studio-secondary" disabled={locked} onClick={() => void desk.download()}>下载完整稿</button><Upload label="读回下载副本" disabled={locked} onFile={file => void desk.importCopy(file, true)} /><button type="button" className="studio-primary" disabled={locked || !desk.protectedCopy} onClick={desk.continueLeaving}>已保留，继续切换</button><button type="button" className="studio-text-button" onClick={() => desk.setLeaving(null)}>继续编辑</button></div></section></WorkspaceDialog>}
    {confirmClear && <WorkspaceDialog onClose={() => setConfirmClear(false)}><section className="workspace-material-dialog" role="dialog" aria-modal="true" aria-label="确认清空准确本机稿"><h2>清空这一份本机稿</h2><p>只清空当前本机稿，不删除服务器教学版本或课程。会先核对当前本机记录；其他标签已有修改时拒绝清空。</p><div className="workspace-page-controls"><button type="button" className="studio-secondary" disabled={locked} onClick={() => { setConfirmClear(false); void desk.clear(); }}>确认清空这一份</button><button type="button" className="studio-text-button" onClick={() => setConfirmClear(false)}>保留当前稿</button></div></section></WorkspaceDialog>}
  </section>;
}
