'use client';
import * as React from 'react';
import type { KnowledgeAtom, MasteryEstimate, StudioLearningPack, StudioLearningPackPreview, StudioSourceMaterial, StudioSubject } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';

type Props = {
  studentId: string;
  subject: StudioSubject;
  atoms: Array<Pick<KnowledgeAtom, 'id' | 'name' | 'objective'>>;
  estimates: Array<Pick<MasteryEstimate, 'atomId' | 'status'>>;
  materials: StudioSourceMaterial[];
  packs: StudioLearningPack[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

const statusNames = { fragile: '优先重建', learning: '继续巩固', insufficient: '证据不足', unknown: '尚未测量', secure: '稳定掌握' } as const;

export function LearningPackStudio({ studentId, subject, atoms, estimates, materials, packs, onChanged, onError }: Props) {
  const orderedAtoms = [...atoms].sort((a, b) => {
    const rank = { fragile: 0, learning: 1, insufficient: 2, unknown: 2, secure: 3 } as Record<string, number>;
    return rank[estimates.find(item => item.atomId === a.id)?.status ?? 'unknown'] -
      rank[estimates.find(item => item.atomId === b.id)?.status ?? 'unknown'];
  });
  const [selectedAtoms, setSelectedAtoms] = React.useState<string[]>(() => orderedAtoms.slice(0, 2).map(atom => atom.id));
  const [sourceMaterialId, setSourceMaterialId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [preview, setPreview] = React.useState<StudioLearningPackPreview | null>(null);
  const [selectedPackId, setSelectedPackId] = React.useState(packs[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const selectedPack = packs.find(pack => pack.id === selectedPackId) ?? packs[0];

  async function run(work: () => Promise<void>) {
    setBusy(true); onError('');
    try { await work(); } catch (error) { onError(error instanceof Error ? error.message : '个性化学案生成未完成'); }
    finally { setBusy(false); }
  }
  function toggleAtom(atomId: string) {
    setPreview(null);
    setSelectedAtoms(ids => ids.includes(atomId) ? ids.filter(id => id !== atomId) : ids.length < 4 ? [...ids, atomId] : ids);
  }
  async function generate() {
    if (!selectedAtoms.length) { onError('请至少选择一个知识点'); return; }
    await run(async () => setPreview(await apiRequest<StudioLearningPackPreview>('/learning/studio/study-packs/preview', { method: 'POST',
      body: JSON.stringify({ studentId, subject, focusAtomIds: selectedAtoms, ...(title.trim() ? { title: title.trim() } : {}),
        ...(sourceMaterialId ? { sourceMaterialId } : {}) }) })));
  }
  async function save() {
    if (!preview) return;
    await run(async () => {
      const pack = await apiRequest<StudioLearningPack>('/learning/studio/study-packs', { method: 'POST',
        body: JSON.stringify({ studentId, subject, focusAtomIds: selectedAtoms, ...(title.trim() ? { title: title.trim() } : {}),
          ...(sourceMaterialId ? { sourceMaterialId } : {}), fingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }) });
      setPreview(null); setSelectedPackId(pack.id); await onChanged();
    });
  }

  return <section className="sa-learning-pack-studio">
    <header><div><span className="studio-kicker">PERSONAL STUDY PACK</span><h1>一份学案，四个证据环节。</h1>
      <p>从已审核知识定义、讲解、例子和易错点生成讲义、闪卡与微测清单；可选 PDF 页作为人工对照来源。</p></div>
      <button onClick={() => window.print()}>打印当前学案</button></header>
    <div className="sa-pack-layout">
      <aside className="sa-pack-builder"><span className="studio-kicker">01 / SELECT FOCUS</span>
        <label>学案名称<input value={title} onChange={event => setTitle(event.target.value)} placeholder="留空则按知识点自动命名" maxLength={180} /></label>
        <div className="sa-pack-atoms">{orderedAtoms.map(atom => {
          const status = estimates.find(item => item.atomId === atom.id)?.status ?? 'unknown';
          return <label key={atom.id} data-active={selectedAtoms.includes(atom.id)} data-status={status}>
            <input type="checkbox" checked={selectedAtoms.includes(atom.id)} disabled={!selectedAtoms.includes(atom.id) && selectedAtoms.length >= 4}
              onChange={() => toggleAtom(atom.id)} /><span><b>{atom.name}</b><small>{statusNames[status]} · {atom.objective}</small></span></label>;
        })}</div>
        <label>对照 PDF（可选）<select value={sourceMaterialId} onChange={event => { setSourceMaterialId(event.target.value); setPreview(null); }}>
          <option value="">只使用已审核知识素材</option>{materials.map(material => <option key={material.id} value={material.id}>{material.title}</option>)}</select></label>
        <p>PDF 页面不会自动等同于知识点映射；系统只在能核对文本时保留页码，并明确标注待人工确认。</p>
        <button disabled={busy || !selectedAtoms.length} onClick={() => void generate()}>{busy ? '正在编排…' : '生成学案预览'}</button>
      </aside>
      <main className="sa-pack-preview">{preview ? <>
        <header><div><span className="studio-kicker">REVIEW BEFORE SAVING</span><h2>{preview.title}</h2></div>
          <div className="sa-pack-stats"><span><b>{preview.sections.length}</b> 讲解段</span><span><b>{preview.flashcards.length}</b> 闪卡</span><span><b>{preview.practiceSteps.length}</b> 任务</span></div></header>
        {preview.warnings.map(warning => <p className="sa-pack-warning" key={warning}>{warning}</p>)}
        <div className="sa-pack-sections">{preview.sections.map(section => <article key={section.id} data-kind={section.kind}>
          <span>{({ explain: '理解', example: '示例', misconception: '易错验证', transfer: '迁移检查' })[section.kind]}</span>
          <div><h3>{section.title}</h3><p>{section.body}</p><ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>
            <small>{section.citations.map(item => item.label + (item.page ? ' · 第 ' + item.page + ' 页' : '')).join('；')}</small></div></article>)}</div>
        <div className="sa-pack-cards">{preview.flashcards.map((card, index) => <details key={card.id}><summary><span>{String(index + 1).padStart(2, '0')}</span><b>{card.prompt}</b></summary>
          <p>{card.answer}</p><small>提示：{card.hint}</small></details>)}</div>
        <ol className="sa-pack-practice">{preview.practiceSteps.map(step => <li key={step.id}><span>{step.minutes} MIN</span><div><b>{step.title}</b><p>{step.detail}</p></div></li>)}</ol>
        <footer><button onClick={() => setPreview(null)}>返回调整</button><button disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存到 Materials'}</button></footer>
      </> : <div className="sa-pack-empty"><span className="studio-kicker">GROUNDED, NOT INVENTED</span><h2>讲义先解释，再用新题验证。</h2>
        <p>选择 1–4 个知识点后预览。学案会区分知识定义、已审核例子、可验证易错假设与迁移任务；内容不足时明确停止。</p></div>}
      </main>
      <aside className="sa-pack-library"><span className="studio-kicker">SAVED PACKS</span>
        {packs.length ? packs.map(pack => <button key={pack.id} data-active={selectedPack?.id === pack.id} onClick={() => setSelectedPackId(pack.id)}>
          <span>{pack.sections.length} 段 · {pack.flashcards.length} 卡</span><b>{pack.title}</b><small>{new Date(pack.updatedAt).toLocaleDateString('zh-CN')}</small></button>)
          : <p>还没有保存的个性化学案。</p>}
        {selectedPack && !preview && <article className="sa-pack-saved">
          <header><span>{selectedPack.atomIds.length} 个知识点</span><h3>{selectedPack.title}</h3></header>
          <div>{selectedPack.sections.map(section => <details key={section.id}><summary>{section.title}</summary><p>{section.body}</p></details>)}</div>
          <button onClick={() => window.print()}>打印 / 保存 PDF</button>
          <a href={'/student/assessment?studentId=' + encodeURIComponent(studentId) + '&subject=' + encodeURIComponent(subject) +
            '&atom=' + encodeURIComponent(selectedPack.atomIds[0])}>开始定向微测 ↗</a>
        </article>}
      </aside>
    </div>
  </section>;
}
