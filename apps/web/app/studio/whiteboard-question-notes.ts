import { whiteboardSceneExhibits, type WhiteboardTeachingNotes } from '@study-agent/contracts';
import { replyBoardMarkdown } from './classroom/reply-board-notes';

const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+!|])/g, '\\$1');
const cell = (value: string) => text(value).replace(/\r?\n/g, '<br>');
function code(value: string, language = '') {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length)), fence = '`'.repeat(Math.max(3, longest + 1));
  return fence + language + '\n' + value + '\n' + fence;
}
export function whiteboardQuestionNotesMarkdown(notes: WhiteboardTeachingNotes) {
  const parts = ['# ' + text(notes.original.title), '导出时间：' + notes.exportedAt, ...notes.notices.map(text), '## 原讲解'];
  for (const scene of notes.original.scenes) {
    parts.push('### ' + text(scene.title), code(scene.narration, 'text'));
    if (scene.body) parts.push(text(scene.body));
    for (const point of scene.bullets ?? []) parts.push('- ' + text(point));
    for (const exhibit of whiteboardSceneExhibits(scene)) {
      if (exhibit.kind === 'table') parts.push('| ' + exhibit.headers.map(cell).join(' | ') + ' |\n| ' + exhibit.headers.map(() => '---').join(' | ') + ' |\n' + exhibit.rows.map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n'));
      else parts.push(text(exhibit.explanation), code(exhibit.latex, 'latex'));
    }
    if (scene.diagram) parts.push(text(scene.diagram.title + '：' + scene.diagram.labels.join(' / ')));
    if (scene.figure) parts.push(text('图示：' + scene.figure.alt + '；' + scene.figure.caption));
    if (scene.source) parts.push(text('来源：' + scene.source.label + ' · 第' + scene.source.page + '页'));
  }
  parts.push('## 全部已保存提问与AI补充');
  const status = { queued: '等待回答', running: '正在思考', cancelling: '正在取消', completed: '已发布AI补充', failed: '回答未完成', cancelled: '已取消' };
  const intent = { question: '问题讲解', example: '换个例子', simplify: '简化讲解', prerequisite: '先修基础', compare: '对比理解' };
  for (const [index, turn] of notes.turns.entries()) {
    parts.push('### 提问 ' + (index + 1), '原句：' + text(turn.position.sentenceText), '原稿状态：' + (turn.originalStatus === 'current' ? '当前版本' : '历史版本'),
      '讲解方式：' + intent[turn.intent] + '；实际模型：' + text(turn.modelName) + '；状态：' + status[turn.status], code(turn.message, 'text'));
    if (turn.reply) {
      parts.push('AI补充回答：', code(turn.reply.text, 'text'));
      if (turn.reply.board) parts.push(replyBoardMarkdown(turn.reply.board));
      for (const anchor of turn.reply.anchors) parts.push('来源锚点：' + text(anchor.label) + (anchor.source ? ' · ' + text(anchor.source.label) + ' · 第' + anchor.source.page + '页' : ''));
    }
    if (turn.teachingVersions?.length) {
      parts.push('#### 全部教学版本');
      for (const version of turn.teachingVersions) {
        parts.push('版本：' + text(version.id) + (version.current ? '（当前采用）' : '') + '；创建时间：' + text(version.createdAt),
          '原回答摘要：' + text(version.replyFingerprint) + '；前版本：' + text(version.previousVersionId ?? '无'));
        if (version.figure) parts.push('图片说明：' + text(version.figure.alt), '图注：' + text(version.figure.caption),
          '图片来源ID：' + text(version.figure.visualId), '原PNG SHA256：' + text(version.figure.originalSha256), '显示图 SHA256：' + text(version.figure.imageSha256));
        else parts.push('原回答，无配图。');
      }
    }
  }
  return parts.join('\n\n') + '\n';
}
