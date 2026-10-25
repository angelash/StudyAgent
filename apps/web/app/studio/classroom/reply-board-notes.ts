import type { ClassroomReplyBoard } from '@study-agent/contracts';
import { formulaMathMl } from './board-formula';

const html = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
const markdownText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cell = (value: string) => markdownText(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
export function replyBoardMarkdown(board: ClassroomReplyBoard) {
  const parts = ['### ' + markdownText(board.title), board.points.map(point => '- ' + markdownText(point)).join('\n')];
  if (board.diagram) parts.push(markdownText(board.diagram.title + '：' + board.diagram.labels.join(' / ')));
  if (board.table) parts.push('#### ' + markdownText(board.table.title), '| ' + board.table.headers.map(cell).join(' | ') + ' |\n| ' + board.table.headers.map(() => '---').join(' | ') + ' |\n' + board.table.rows.map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n'));
  for (const formula of board.formulas ?? []) parts.push('#### ' + markdownText(formula.label), '$$\n' + formula.latex + '\n$$', markdownText(formula.meaning));
  return parts.join('\n\n');
}
export function replyBoardHtml(board: ClassroomReplyBoard) {
  return '<section><h3>' + html(board.title) + '</h3><ul>' + board.points.map(point => '<li>' + html(point) + '</li>').join('') + '</ul>' +
    (board.table ? '<table><caption>' + html(board.table.title) + '</caption><thead><tr>' + board.table.headers.map(value => '<th scope="col">' + html(value) + '</th>').join('') + '</tr></thead><tbody>' + board.table.rows.map(row => '<tr>' + row.map(value => '<td>' + html(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '') +
    (board.formulas ?? []).map(formula => '<figure><figcaption>' + html(formula.label) + '</figcaption>' + formulaMathMl(formula.latex) + '<p>' + html(formula.meaning) + '</p></figure>').join('') + '</section>';
}
