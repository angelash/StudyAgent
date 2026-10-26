'use client';
import * as React from 'react';
import { WorkspaceDialog } from '../workspace-dialog';
import './tool-tour.css';

export type ToolTourStep = { anchor: string; location: string; title: string; text: string };
const classroomSteps = [
  { anchor: 'connection', location: '标题栏', title: '连接与断点', text: '这里显示课堂标题和保存状态。离开后再回来，可以从已保存的位置继续。' },
  { anchor: 'notes', location: '白板工具栏', title: '笔记与回顾', text: '导出已讲内容和插问笔记。参考图可以随笔记离线保存，也可以在设置中打印为 PDF。' },
  { anchor: 'settings', location: '白板工具栏', title: '音色与倍速', text: '设置里可以调整音色、语速、字体和点阵。音色从下一句生效，倍速同步当前声音。' },
  { anchor: 'sound', location: '白板左下角', title: '静音阅读', text: '静音后仍会按整句、整项展示讲解和板书。也可以用下一步按自己的节奏阅读。' },
  { anchor: 'microphone', location: '对话输入栏', title: '随时插问', text: '输入问题会暂停讲解。只有主动打开麦克风才开始转写，转写后仍由你确认发送。' },
  { anchor: 'playback', location: '对话输入栏', title: '暂停与继续', text: '暂停会停止当前声音和自动步进。继续时从原句开始；有疑问时可以先留下自己的问题。' },
  { anchor: 'history', location: '对话面板', title: '对话历史', text: '已讲内容和插问保存在这里。点击板书标题可回到对应位置，回看不改变原来的作答记录。' },
];
type Box = { left: number; top: number; width: number; height: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

export function ClassroomToolTour({ onClose, onStep, steps = classroomSteps, scope, label = '课堂新手引导', welcome = '欢迎来到白板课堂',
  introduction = '用七个常用控件，按自己的节奏听讲、插问和回顾。随时可以从设置重新打开导览。', completion = '导览结束。你的讲解位置和问题都留在原处，准备好后再继续学习。', returnLabel = '返回课堂' }:
  { onClose: () => void; onStep: (index: number | null) => void; steps?: readonly ToolTourStep[]; scope?: HTMLElement | null; label?: string; welcome?: string; introduction?: string; completion?: string; returnLabel?: string }) {
  const [stage, setStage] = React.useState(-1), [target, setTarget] = React.useState<Box | null>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
  const [skipLow, setSkipLow] = React.useState(false);
  const card = React.useRef<HTMLElement>(null), callback = React.useRef(onStep), heading = React.useId();
  callback.current = onStep;
  const step = steps[stage];
  React.useLayoutEffect(() => {
    const expose = () => callback.current(step ? stage : null);
    expose(); window.addEventListener('resize', expose);
    return () => window.removeEventListener('resize', expose);
  }, [stage, step]);
  React.useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const viewport = window.visualViewport, width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const offsetX = viewport?.offsetLeft ?? 0, offsetY = viewport?.offsetTop ?? 0;
      const node = step ? (scope ?? document).querySelector<HTMLElement>('[data-classroom-tour="' + step.anchor + '"]') : null;
      const bounds = node?.getBoundingClientRect();
      const visible = bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > offsetY && bounds.top < offsetY + height && bounds.right > offsetX && bounds.left < offsetX + width;
      const box = visible ? { left: clamp(bounds.left - 5, offsetX + 4, offsetX + width - 12), top: clamp(bounds.top - 5, offsetY + 4, offsetY + height - 12),
        width: Math.min(bounds.width + 10, width - 8), height: Math.min(bounds.height + 10, height - 8) } : null;
      if (box) { box.width = Math.min(box.width, offsetX + width - box.left - 4); box.height = Math.min(box.height, offsetY + height - box.top - 4); }
      setTarget(box);
      setSkipLow(!!box && box.top < offsetY + 64 && box.left < offsetX + width / 2 + 45 && box.left + box.width > offsetX + width / 2 - 45);
      const cardWidth = card.current?.offsetWidth ?? 320, cardHeight = card.current?.offsetHeight ?? 240;
      const left = box ? box.left + box.width / 2 - cardWidth / 2 : offsetX + (width - cardWidth) / 2;
      const below = box ? box.top + box.height + 16 : offsetY + (height - cardHeight) / 2;
      const top = box && below + cardHeight > offsetY + height - 16 ? box.top - cardHeight - 16 : below;
      setPosition({ left: clamp(left, offsetX + 16, offsetX + width - cardWidth - 16), top: clamp(top, offsetY + 64, offsetY + height - cardHeight - 16) });
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(update), node = step ? (scope ?? document).querySelector('[data-classroom-tour="' + step.anchor + '"]') : null;
    if (node) observer.observe(node); if (card.current) observer.observe(card.current);
    measure(); update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); };
  }, [stage, step, scope]);
  const next = () => { setPosition(null); setTarget(null); setStage(value => value + 1); };
  return <WorkspaceDialog onClose={onClose}><div className="cl-guided-tour" data-anchored={!!step && !!target} data-skip-low={!!step && skipLow}
    role="dialog" aria-modal="true" aria-label={label} aria-describedby={heading}>
    {step && target && <div className="cl-tour-target" data-anchor={step.anchor} aria-hidden="true" style={target}/>}
    <button className="cl-tour-skip" aria-label="跳过" onClick={onClose}>× 跳过</button>
    <section ref={card} className={'cl-tour-card' + (step ? ' cl-tour-card-step' : '')} style={step && position ? position : undefined}
      tabIndex={-1}>
      {!step ? <><h2 id={heading}>{stage < 0 ? welcome : '准备好了'}</h2>
        <p>{stage < 0 ? introduction : completion}</p>
        {stage < 0 ? <><button className="cl-tour-primary" onClick={next}>开始导览</button><button className="cl-tour-later" onClick={onClose}>我已了解，跳过</button></> : <button className="cl-tour-primary" onClick={onClose}>{returnLabel}</button>}</> : <>
        <small className="cl-tour-location">{step.location}</small><h2 id={heading}>{step.title}</h2><p>{step.text}</p>
        {!target && <p className="cl-tour-unavailable">这个控件在当前布局中暂不可见。可以关闭导览后，返回白板或打开对话面板查看。</p>}
        <footer><div className="cl-tour-progress" role="status" aria-label={'第' + (stage + 1) + '步，共' + steps.length + '步'}>{steps.map((item, index) => <i key={item.anchor} data-active={index === stage}/>)}</div>
          <button aria-label="上一步" onClick={() => { setPosition(null); setStage(value => value - 1); }}>←</button>
          <button className="cl-tour-primary" onClick={next}>{stage === steps.length - 1 ? '完成' : '下一步'} →</button></footer>
      </>}
    </section>
  </div></WorkspaceDialog>;
}
