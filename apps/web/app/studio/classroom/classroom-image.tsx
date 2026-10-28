'use client';
import * as React from 'react';
import type { ClassroomBlock } from '@study-agent/contracts';
import { FigureReader } from './figure-reader';

export function ClassroomImage({ image, onOpen, interactive = true }: { image: NonNullable<ClassroomBlock['image']>; onOpen?: () => void; interactive?: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Classroom curriculum only references bundled assets, never arbitrary model URLs.
  if (!image.src.startsWith('/classroom/')) return null;
  if (!interactive) return <figure className="cl-lesson-image"><img src={image.src} alt={image.alt}/><figcaption>{image.caption}</figcaption></figure>;
  return <><figure className="cl-lesson-image"><button aria-label={'放大图片：' + image.caption} onClick={() => { onOpen?.(); setExpanded(true); }}>
    <img src={image.src} alt={image.alt} onError={() => setFailed(true)}/><span aria-hidden="true">↗</span></button><figcaption>{image.caption}</figcaption></figure>
    {expanded && <FigureReader title={image.caption} onClose={() => setExpanded(false)}>
      {failed ? <p className="cl-reader-error" role="alert">图片暂未能打开。{image.alt}。可以关闭后刷新重试。</p> : <img src={image.src} alt={image.alt} onError={() => setFailed(true)}/>}
    </FigureReader>}</>;
}
