'use client';
import { topicWhiteboardContentSchema } from '@study-agent/contracts';
import { WhiteboardExhibit } from '../whiteboard-exhibit';
export function TopicManuscript({ content }: { content: unknown }) {
  const parsed = topicWhiteboardContentSchema.safeParse(content);
  if (!parsed.success) return <p role="status">此原稿暂不能排版，请下载完整版本核对。</p>;
  const manuscript = parsed.data;
  return <article className="tw-manuscript"><h3>{manuscript.title}</h3><p>{manuscript.description}</p>
    {manuscript.scenes.map((scene, index) => <section key={index}><h4>{index + 1}. {scene.title}</h4>
      <p className="tw-spoken-copy">{scene.narration}</p>{scene.body && <p>{scene.body}</p>}
      {!!scene.bullets.length && <ul>{scene.bullets.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <WhiteboardExhibit exhibit={scene.exhibit}/></section>)}
  </article>;
}
