export type CalendarInterval = { startsAt: string; endsAt: string };
export type LocalMinute = { localDate: string; localTime: string };
export type ZonedMinute = LocalMinute & { timeZone: string; offsetMinutes: number; instant: string };
export type DateLoad = { localDate: string; occupiedMinutes: number };

export class CalendarTimeError extends Error {
  constructor(readonly code: 'invalid_time_zone' | 'invalid_local_time' | 'nonexistent_local_time' |
    'invalid_offset' | 'invalid_interval', message: string, readonly choices: ZonedMinute[] = []) { super(message); }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) {
    throw new CalendarTimeError('invalid_time_zone', '请选择有效的 IANA 时区。');
  }
  let value = formatters.get(timeZone);
  if (!value) {
    try {
      value = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        second: '2-digit', hourCycle: 'h23',
      });
    } catch { throw new CalendarTimeError('invalid_time_zone', '请选择有效的 IANA 时区。'); }
    if (formatters.size >= 128) formatters.clear();
    formatters.set(timeZone, value);
  }
  return value;
}

function civilEpoch(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const value = new Date(0); value.setUTCFullYear(year, month - 1, day); value.setUTCHours(hour, minute, second, 0);
  return value.getTime();
}

function parseLocal(value: LocalMinute) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) || !/^\d{2}:\d{2}$/.test(value.localTime)) {
    throw new CalendarTimeError('invalid_local_time', '请完整填写当地日期和分钟。');
  }
  const [year, month, day] = value.localDate.split('-').map(Number), [hour, minute] = value.localTime.split(':').map(Number);
  const epoch = civilEpoch(year, month, day, hour, minute), check = new Date(epoch);
  if (year < 1 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day ||
    check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) {
    throw new CalendarTimeError('invalid_local_time', '当地日期或时间无效，请核对实际日期。');
  }
  return epoch;
}

function parts(epoch: number, timeZone: string) {
  if (!Number.isFinite(epoch)) throw new CalendarTimeError('invalid_interval', '日程时间无效。');
  const result: Record<string, number> = {};
  for (const item of formatter(timeZone).formatToParts(epoch)) if (item.type !== 'literal') result[item.type] = Number(item.value);
  const { year, month, day, hour, minute, second } = result;
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new CalendarTimeError('invalid_interval', '无法核对日程的实际当地时间。');
  }
  const localDate = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const localTime = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  const offsetMinutes = (civilEpoch(year, month, day, hour, minute, second) - Math.floor(epoch / 1000) * 1000) / 60_000;
  return { localDate, localTime, offsetMinutes };
}

export function canonicalTimeZone(timeZone: string) { return formatter(timeZone).resolvedOptions().timeZone; }

export function localMinuteChoices(input: LocalMinute, timeZone: string): ZonedMinute[] {
  const anchor = parseLocal(input), canonical = canonicalTimeZone(timeZone), offsets = new Set<number>();
  // Sampling both sides discovers actual database offsets rather than assuming
  // one-hour DST or that the browser's current timezone matches this schedule.
  for (let hours = -36; hours <= 36; hours += 3) offsets.add(parts(anchor + hours * 3_600_000, canonical).offsetMinutes);
  const choices: ZonedMinute[] = [];
  for (const offsetMinutes of offsets) {
    const epoch = anchor - offsetMinutes * 60_000, actual = parts(epoch, canonical);
    if (Number.isInteger(offsetMinutes) && actual.localDate === input.localDate && actual.localTime === input.localTime && actual.offsetMinutes === offsetMinutes) {
      choices.push({ ...input, timeZone: canonical, offsetMinutes, instant: new Date(epoch).toISOString() });
    }
  }
  return choices.sort((a, b) => a.instant.localeCompare(b.instant));
}

export function resolveZonedMinute(input: LocalMinute & { offsetMinutes: number }, timeZone: string): ZonedMinute {
  const choices = localMinuteChoices(input, timeZone);
  if (!choices.length) throw new CalendarTimeError('nonexistent_local_time', '该时区没有这个当地时刻，请选择实际存在的时间。');
  const choice = choices.find(value => Number.isInteger(input.offsetMinutes) && value.offsetMinutes === input.offsetMinutes);
  if (!choice) throw new CalendarTimeError('invalid_offset', '请明确选择这个当地时刻对应的 UTC 偏移。', choices);
  return choice;
}

function interval(value: CalendarInterval) {
  if (typeof value.startsAt !== 'string' || typeof value.endsAt !== 'string' ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.startsAt) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.endsAt)) {
    throw new CalendarTimeError('invalid_interval', '忙碌区间必须包含实际 UTC 偏移。');
  }
  for(const original of [value.startsAt,value.endsAt]){
    const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(original);
    if(!match||Number(match[3])>59||match[4]!=='Z'&&(Number(match[5])>14||Number(match[6])>59||Number(match[5])===14&&Number(match[6])!==0))throw new CalendarTimeError('invalid_interval','日程记录的日期、时间或UTC偏移无效。');
    try{parseLocal({localDate:match[1],localTime:match[2]});}catch{throw new CalendarTimeError('invalid_interval','日程记录的当地日期无效。');}
  }
  const startsAt = Date.parse(value.startsAt), endsAt = Date.parse(value.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || endsAt - startsAt > 366 * 86_400_000) {
    throw new CalendarTimeError('invalid_interval', '日程区间无效，请核对原记录。');
  }
  return { startsAt, endsAt };
}

export function calendarIntervalsOverlap(a: CalendarInterval, b: CalendarInterval) {
  const first = interval(a), second = interval(b);
  return first.startsAt < second.endsAt && second.startsAt < first.endsAt;
}

export function unionCalendarIntervals(values: readonly CalendarInterval[]): CalendarInterval[] {
  const sorted = values.map(interval).sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt), merged: ReturnType<typeof interval>[] = [];
  for (const value of sorted) {
    const previous = merged.at(-1);
    if (previous && value.startsAt <= previous.endsAt) previous.endsAt = Math.max(previous.endsAt, value.endsAt);
    else merged.push({ ...value });
  }
  return merged.map(value => ({ startsAt: new Date(value.startsAt).toISOString(), endsAt: new Date(value.endsAt).toISOString() }));
}

export function calendarLoadByLocalDate(values: readonly CalendarInterval[], timeZone: string): DateLoad[] {
  const canonical = canonicalTimeZone(timeZone), totals = new Map<string, number>();
  for (const value of unionCalendarIntervals(values)) {
    const end = Date.parse(value.endsAt); let cursor = Date.parse(value.startsAt), segments = 0;
    while (cursor < end) {
      if (++segments > 740) throw new CalendarTimeError('invalid_interval', '日程跨度过大，无法核对每日预算。');
      const date = parts(cursor, canonical).localDate;
      let same = cursor, different = cursor;
      // Midnight itself can be absent. Locate the actual instant when the local
      // date changes, including short/long DST days and date-line skips.
      do { different = Math.min(end, different + 3 * 3_600_000); if (different === end) break;
        if (parts(different, canonical).localDate === date) same = different; else break;
      } while (different - cursor <= 72 * 3_600_000);
      if (different < end && parts(different, canonical).localDate === date) {
        throw new CalendarTimeError('invalid_interval', '无法核对该时区的当地日期边界。');
      }
      let boundary = end;
      if (parts(different - 1, canonical).localDate !== date) {
        let low = same, high = different;
        while (high - low > 1) { const middle = low + Math.floor((high - low) / 2); if (parts(middle, canonical).localDate === date) low = middle; else high = middle; }
        boundary = high;
      }
      totals.set(date, (totals.get(date) ?? 0) + (boundary - cursor) / 60_000); cursor = boundary;
    }
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([localDate, occupiedMinutes]) => ({ localDate, occupiedMinutes }));
}
