import { apiBaseUrl } from './api';

export function questionMediaUrl(input: string | undefined | null) {
  if (!input || /[\\\x00-\x20]/.test(input)) return '';
  if (input.startsWith('/api/')) return `${apiBaseUrl.replace(/\/$/, '')}${input}`;
  if (input.startsWith('/question-assets/')) return input;
  try { const url = new URL(input); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
