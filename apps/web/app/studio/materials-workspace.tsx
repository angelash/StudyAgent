'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { StudioOverview, StudioWhiteboard } from '@study-agent/contracts';
import type { SessionUser } from '../../lib/session-user';
import type { LearningContext } from '../../lib/learning-context';
import { materialsTabs, readMaterialsTab, type MaterialsTab } from '../../lib/materials-navigation';
import { PersonalMaterials } from './personal-materials';
import { PdfMaterialLab } from './pdf-material-lab';
import { LearningPackStudio } from './learning-pack-studio';
import { LibraryStudio } from '../library/studio';
import './materials-workspace.css';

export function MaterialsWorkspace({ identity, context, overview, onChanged, onOpenWhiteboard, onError }: {
  identity: SessionUser; context: LearningContext; overview: StudioOverview; onChanged: () => Promise<void>;
  onOpenWhiteboard: (value: StudioWhiteboard) => void; onError: (value: string) => void;
}) {
  const query = useSearchParams(), independent = context.audience === 'self', tab = readMaterialsTab(new URLSearchParams(query.toString()), independent), id = React.useId();
  const available = materialsTabs.filter(item => !independent || !['files', 'packs'].includes(item.id));
  const key = JSON.stringify([identity.id, context.studentId ?? null, independent ? null : context.subject]);
  function choose(next: MaterialsTab) {
    const params = new URLSearchParams(window.location.search);
    if (tab === 'papers' && !params.has('paper')) params.set('paperScroll', String(Math.round(window.scrollY)));
    params.set('view', 'materials'); params.set('tab', next);
    window.history.pushState(null, '', '/studio?' + params); window.scrollTo({ top: 0 });
  }
  function move(event: React.KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % available.length : event.key === 'ArrowLeft' ? (index + available.length - 1) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : -1;
    if (next < 0) return; event.preventDefault(); choose(available[next].id);
    requestAnimationFrame(() => document.getElementById(id + '-' + available[next].id)?.focus());
  }
  return <section className="sa-page workspace-materials"><header className="workspace-materials-title"><h1>资料</h1><p>{independent ? '自己的PDF、文字与题卷，沿用当前账号保存。' : '当前学习档案的原文、PDF结构、学案与题卷。'}</p></header>
    <div className="workspace-tabs workspace-materials-tabs" role="tablist" aria-label="资料分类">{available.map((item, index) => <button type="button" role="tab" key={item.id} id={id + '-' + item.id} aria-controls={id + '-panel'} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => move(event, index)} onClick={() => choose(item.id)}>{item.label}</button>)}</div>
    <div className="workspace-materials-panel" role="tabpanel" id={id + '-panel'} aria-labelledby={available.some(item => item.id === tab) ? id + '-' + tab : undefined}>
      {tab === 'personal' && <PersonalMaterials key={key} identity={identity} context={context} />}
      {tab === 'papers' && <LibraryStudio key={key} embedded context={context} />}
      {['files', 'packs'].includes(tab) && (!overview.selected || independent) && <section className="workspace-materials-condition"><h2>这类学案与知识点白板需要已确认的学习范围</h2><p>个人PDF和文字可以在学习资料中阅读、核对原文并创建课程。</p><button className="workspace-button" onClick={() => choose('personal')}>查看我的资料</button></section>}
      {tab === 'files' && overview.selected && !independent && <PdfMaterialLab key={key} studentId={overview.selected.id} subject={overview.selected.subject} materials={overview.materials.filter(material => material.kind !== 'text')} atoms={overview.selected.atoms} onChanged={onChanged} onOpenWhiteboard={onOpenWhiteboard} onError={onError} />}
      {tab === 'packs' && overview.selected && !independent && <LearningPackStudio key={key} studentId={overview.selected.id} subject={overview.selected.subject} atoms={overview.selected.atoms} estimates={overview.selected.estimates} materials={overview.materials} packs={overview.studyPacks} onChanged={onChanged} onError={onError} />}
    </div>
  </section>;
}
