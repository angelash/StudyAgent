import { describe, expect, it } from 'vitest';
import { parseIcs, renderIcs } from './ics-calendar';

describe('ICS calendar integration', () => {
  it('parses folded summaries, descriptions and timed events', () => {
    const events = parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:lesson-1\r\nDTSTART:20261022T080000Z\r\nDTEND:20261022T084500Z\r\nSUMMARY:Unit exam and\\, review\r\nDESCRIPTION:Line one\\nLine two\r\nEND:VEVENT\r\nEND:VCALENDAR');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Unit exam and, review', startsAt: '2026-10-22T08:00:00.000Z', endsAt: '2026-10-22T08:45:00.000Z', allDay: false });
  });

  it('expands bounded weekly recurrence and escapes exported fields', () => {
    const events = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:weekly\nDTSTART:20261022T080000Z\nDTEND:20261022T090000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Math, weekly; lab\nEND:VEVENT\nEND:VCALENDAR');
    expect(events).toHaveLength(3);
    const output = renderIcs('Class', [{ uid: '1', title: 'A, B; C', description: 'line', startsAt: events[0].startsAt, endsAt: events[0].endsAt }]);
    expect(output).toContain('SUMMARY:A\\, B\\; C');
    expect(output).toContain('BEGIN:VEVENT');
    const allDay = renderIcs('Class', [{ uid: '2', title: '全天任务', description: '', startsAt: '2026-10-24T00:00:00.000Z',
      endsAt: '2026-10-25T00:00:00.000Z', allDay: true }]);
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261024');
    expect(allDay).toContain('DTEND;VALUE=DATE:20261025');
    const folded = renderIcs('学习日历', [{ uid: '3', title: '很长的原创学习任务标题'.repeat(8), description: '',
      startsAt: events[0].startsAt, endsAt: events[0].endsAt }]);
    expect(folded.split('\r\n').every(line => Buffer.byteLength(line) <= 74)).toBe(true);
  });

  it('preserves explicit offsets, named zones, all-day durations and cancellations', () => {
    const events = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:offset\nDTSTART:20261022T080000+0800\nDTEND:20261022T090000+0800\nSUMMARY:Shanghai class\nEND:VEVENT\nBEGIN:VEVENT\nUID:zone\nDTSTART;TZID=Asia/Shanghai:20261023T080000\nDTEND;TZID=Asia/Shanghai:20261023T090000\nSUMMARY:Named zone class\nEND:VEVENT\nBEGIN:VEVENT\nUID:all-day\nDTSTART;VALUE=DATE:20261024\nSUMMARY:All day task\nEND:VEVENT\nBEGIN:VEVENT\nUID:cancelled\nDTSTART:20261025T080000Z\nSUMMARY:Cancelled class\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR');
    expect(events.map(event => event.title)).toEqual(['Shanghai class', 'Named zone class', 'All day task']);
    expect(events[0]).toMatchObject({ startsAt: '2026-10-22T00:00:00.000Z', endsAt: '2026-10-22T01:00:00.000Z' });
    expect(events[1]).toMatchObject({ startsAt: '2026-10-23T00:00:00.000Z', endsAt: '2026-10-23T01:00:00.000Z' });
    expect(events[2]).toMatchObject({ allDay: true, startsAt: '2026-10-24T00:00:00.000Z', endsAt: '2026-10-25T00:00:00.000Z' });
  });

  it('honors EXDATE and reports public-only network targets', async () => {
    const events = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:excluded\nDTSTART:20261022T080000Z\nDTEND:20261022T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20261023T080000Z\nSUMMARY:Daily practice\nEND:VEVENT\nEND:VCALENDAR');
    expect(events.map(event => event.startsAt)).toEqual(['2026-10-22T08:00:00.000Z', '2026-10-24T08:00:00.000Z']);
    const { publicIp } = await import('./studio-integration.service');
    expect(publicIp('8.8.8.8')).toBe(true);
    expect(publicIp('127.0.0.1')).toBe(false);
    expect(publicIp('192.168.1.9')).toBe(false);
    expect(publicIp('::1')).toBe(false);
    expect(publicIp('::ffff:192.168.1.9')).toBe(false);
    expect(publicIp('::ffff:7f00:1')).toBe(false);
    expect(publicIp('64:ff9b::c0a8:109')).toBe(false);
    expect(publicIp('2001:db8::1')).toBe(false);
  });

  it('expands multi-day weekly school schedules', () => {
    const events = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:weekday-class\nDTSTART:20261022T080000Z\nDTEND:20261022T090000Z\nRRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO,WE\nSUMMARY:School class\nEND:VEVENT\nEND:VCALENDAR');
    expect(events.map(event => event.startsAt)).toEqual(['2026-10-26T08:00:00.000Z', '2026-10-28T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
  });
});
