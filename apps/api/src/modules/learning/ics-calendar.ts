export type ParsedCalendarEvent = {
  uid: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

function unfold(input: string) {
  return input.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function zonedTime(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const rendered = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    const expected = Date.UTC(year, month - 1, day, hour, minute, second);
    if (rendered === expected) return new Date(guess);
    guess += expected - rendered;
  }
  return new Date(guess);
}

function parseDate(value: string, params = '') {
  const parts = value.split(':');
  const raw = (parts.length > 1 ? parts.slice(1).join(':') : value).trim();
  if (/^\d{8}$/.test(raw)) return { date: new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`), allDay: true };
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/i.exec(raw);
  if (!match) return { date: new Date(raw), allDay: false };
  const [, ys, mos, ds, hs, mins, ss, suffix = ''] = match;
  const values = [ys, mos, ds, hs, mins, ss].map(Number) as [number, number, number, number, number, number];
  let date: Date;
  if (suffix.toUpperCase() === 'Z') date = new Date(Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]));
  else if (/^[+-]\d{4}$/.test(suffix)) {
    const offset = (suffix[0] === '-' ? -1 : 1) * (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(3, 5)));
    date = new Date(Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]) - offset * 60_000);
  } else {
    const timeZone = /TZID=([^;:]+)/i.exec(params)?.[1];
    date = timeZone ? zonedTime(...values, timeZone) : new Date(Date.UTC(...values));
  }
  return { date, allDay: false };
}

function recurrenceDates(start: Date, rule: string, hardEnd: Date) {
  const frequency = /FREQ=(DAILY|WEEKLY|MONTHLY)/i.exec(rule)?.[1]?.toUpperCase();
  if (!frequency) return [start];
  const interval = Math.max(1, Math.min(52, Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? 1)));
  const count = Math.min(100, Math.max(1, Number(/COUNT=(\d+)/i.exec(rule)?.[1] ?? 100)));
  const untilRaw = /UNTIL=([^;\r\n]+)/i.exec(rule)?.[1];
  const until = untilRaw ? parseDate(untilRaw).date : hardEnd;
  const weekDays = /BYDAY=([A-Z,]+)/i.exec(rule)?.[1]?.toUpperCase().split(',');
  if (frequency === 'WEEKLY' && weekDays?.length) {
    const indexes: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const selected = weekDays.map(day => indexes[day]).filter(day => day !== undefined);
    const weekStart = new Date(start); weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const dates: Date[] = [];
    for (let week = 0; dates.length < count; week += 1) {
      let added = false;
      for (const day of selected) {
        const date = new Date(weekStart); date.setUTCDate(weekStart.getUTCDate() + week * 7 * interval + day);
        if (date < start) continue;
        if (date > hardEnd || date > until) return dates;
        dates.push(date); added = true; if (dates.length >= count) break;
      }
      if (!added && week > 104) break;
    }
    return dates;
  }
  const dates: Date[] = [];
  for (let index = 0; index < count && dates.length < 100; index += 1) {
    const date = new Date(start);
    if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + index * interval);
    else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + index * 7 * interval);
    else date.setUTCMonth(date.getUTCMonth() + index * interval);
    if (date > hardEnd || date > until) break;
    dates.push(date);
  }
  return dates;
}

export function parseIcs(input: string, horizonDays = 366): ParsedCalendarEvent[] {
  if (input.length > 2_500_000 || !/BEGIN:VCALENDAR/i.test(input)) throw new Error('不是有效的 iCalendar 日历数据');
  const lines = unfold(input), events: ParsedCalendarEvent[] = [], hardEnd = new Date(Date.now() + Math.max(1, Math.min(horizonDays, 730)) * 86_400_000);
  let block: Array<{ key: string; value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { block = []; continue; }
    if (line === 'END:VEVENT') {
      if (block) {
        const get = (key: string) => block!.find(item => item.key === key);
        if (get('STATUS')?.value.toUpperCase() === 'CANCELLED') { block = null; continue; }
        const startRaw = get('DTSTART'), endRaw = get('DTEND');
        const start = startRaw ? parseDate(startRaw.value, startRaw.params) : null;
        let end = endRaw ? parseDate(endRaw.value, endRaw.params) : null;
        if (start && !end) end = { date: new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 0)), allDay: start.allDay };
        if (start && end && Number.isFinite(start.date.getTime()) && Number.isFinite(end.date.getTime())) {
          const uid = unescapeText(get('UID')?.value || `${startRaw!.value}:${get('SUMMARY')?.value ?? ''}`);
          const duration = Math.max(0, end.date.getTime() - start.date.getTime());
          const rrule = get('RRULE')?.value;
          const excluded = new Set((get('EXDATE')?.value ?? '').split(',').filter(Boolean)
            .map(value => parseDate(value).date.getTime()).filter(Number.isFinite));
          for (const occurrence of recurrenceDates(start.date, rrule ?? '', hardEnd)) {
            if (excluded.has(occurrence.getTime())) continue;
            events.push({ uid: `${uid}:${occurrence.toISOString()}`, title: unescapeText(get('SUMMARY')?.value || '未命名日程'),
              description: unescapeText(get('DESCRIPTION')?.value || ''), startsAt: occurrence.toISOString(),
              endsAt: new Date(occurrence.getTime() + duration).toISOString(), allDay: start.allDay });
          }
        }
      }
      block = null; continue;
    }
    if (block && line.includes(':')) {
      const colon = line.indexOf(':'), left = line.slice(0, colon), value = line.slice(colon + 1), semi = left.indexOf(';');
      const key = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
      block.push({ key, value, params: semi < 0 ? '' : left.slice(semi + 1) });
    }
  }
  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 500);
}

export function calendarEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldLine(line: string) {
  const parts: string[] = []; let current = '', bytes = 0;
  for (const char of line) {
    const width = Buffer.byteLength(char, 'utf8');
    if (bytes + width > 73 && current) { parts.push(current); current = ' ' + char; bytes = 1 + width; }
    else { current += char; bytes += width; }
  }
  if (current) parts.push(current);
  return parts;
}

export function renderIcs(calendarName: string, events: Array<{ uid: string; title: string; description: string;
  startsAt: string; endsAt: string; allDay?: boolean }>) {
  const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const day = (value: string) => new Date(value).toISOString().slice(0, 10).replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyAgent//Learning Calendar//ZH-CN', `X-WR-CALNAME:${calendarEscape(calendarName)}`,
    ...events.flatMap(event => ['BEGIN:VEVENT', `UID:${calendarEscape(event.uid)}`, `DTSTAMP:${stamp(new Date().toISOString())}`,
      event.allDay ? `DTSTART;VALUE=DATE:${day(event.startsAt)}` : `DTSTART:${stamp(event.startsAt)}`,
      event.allDay ? `DTEND;VALUE=DATE:${day(event.endsAt)}` : `DTEND:${stamp(event.endsAt)}`,
      `SUMMARY:${calendarEscape(event.title)}`, `DESCRIPTION:${calendarEscape(event.description)}`, 'END:VEVENT']), 'END:VCALENDAR'];
  return lines.flatMap(foldLine).concat('').join('\r\n');
}
