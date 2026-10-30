import { describe,it,expect } from 'vitest';
import { CalendarTimeError,calendarIntervalsOverlap,calendarLoadByLocalDate,canonicalTimeZone,localMinuteChoices,resolveZonedMinute,unionCalendarIntervals } from './guidance-calendar-time';

describe('actual IANA dates, elapsed minutes and all-subject interval union',()=>{
 it('refuses malformed dates, invalid leap days and unknown zones instead of normalizing them',()=>{
  for(const localDate of ['2026-02-29','2026-04-31','2026-00-12','2026-12-00','0000-01-01'])expect(()=>localMinuteChoices({localDate,localTime:'10:00'},'UTC')).toThrow(CalendarTimeError);
  expect(()=>localMinuteChoices({localDate:'2026-10-30',localTime:'24:00'},'UTC')).toThrow(CalendarTimeError);
  expect(()=>canonicalTimeZone('Owned/Unknown')).toThrow(CalendarTimeError);
  expect(resolveZonedMinute({localDate:'2028-02-29',localTime:'10:00',offsetMinutes:0},'UTC').instant).toBe('2028-02-29T10:00:00.000Z');
 });
 it('uses the selected timezone and an explicit verified offset for half-hour and quarter-hour places',()=>{
  expect(resolveZonedMinute({localDate:'2026-10-30',localTime:'10:00',offsetMinutes:330},'Asia/Kolkata').instant).toBe('2026-10-30T04:30:00.000Z');
  expect(resolveZonedMinute({localDate:'2026-10-30',localTime:'10:00',offsetMinutes:345},'Asia/Kathmandu').instant).toBe('2026-10-30T04:15:00.000Z');
  expect(()=>resolveZonedMinute({localDate:'2026-10-30',localTime:'10:00',offsetMinutes:480},'Asia/Kathmandu')).toThrow('UTC 偏移');
 });
 it('rejects the actual Los Angeles spring gap and requires an explicit choice for its two autumn instants',()=>{
  expect(localMinuteChoices({localDate:'2026-03-08',localTime:'02:30'},'America/Los_Angeles')).toEqual([]);
  expect(()=>resolveZonedMinute({localDate:'2026-03-08',localTime:'02:30',offsetMinutes:-480},'America/Los_Angeles')).toThrow('没有这个当地时刻');
  const input={localDate:'2026-11-01',localTime:'01:30'},choices=localMinuteChoices(input,'America/Los_Angeles');expect(choices.map(row=>[row.offsetMinutes,row.instant])).toEqual([[-420,'2026-11-01T08:30:00.000Z'],[-480,'2026-11-01T09:30:00.000Z']]);
  expect(resolveZonedMinute({...input,offsetMinutes:-480},'America/Los_Angeles').instant).toBe(choices[1].instant);
  try{resolveZonedMinute({...input,offsetMinutes:0},'America/Los_Angeles');throw Error('Expected invalid offset');}catch(error){expect(error).toBeInstanceOf(CalendarTimeError);expect((error as CalendarTimeError).choices).toEqual(choices);}
 });
 it('handles the actual thirty-minute DST transition on Lord Howe without assuming one-hour shifts',()=>{
  expect(localMinuteChoices({localDate:'2026-10-04',localTime:'02:15'},'Australia/Lord_Howe')).toEqual([]);
  expect(localMinuteChoices({localDate:'2026-04-05',localTime:'01:45'},'Australia/Lord_Howe').map(row=>row.offsetMinutes)).toEqual([660,630]);
 });
 it('counts the two actual local dates across midnight and preserves fractional elapsed minutes',()=>{
  expect(calendarLoadByLocalDate([{startsAt:'2026-10-30T15:40:00.000Z',endsAt:'2026-10-30T16:20:30.000Z'}],'Asia/Shanghai')).toEqual([{localDate:'2026-10-30',occupiedMinutes:20},{localDate:'2026-10-31',occupiedMinutes:20.5}]);
 });
 it('measures the real23-hour spring day and25-hour autumn day instead of assigning1440 minutes',()=>{
  expect(calendarLoadByLocalDate([{startsAt:'2026-03-08T08:00:00Z',endsAt:'2026-03-09T07:00:00Z'}],'America/Los_Angeles')).toEqual([{localDate:'2026-03-08',occupiedMinutes:1380}]);
  expect(calendarLoadByLocalDate([{startsAt:'2026-11-01T07:00:00Z',endsAt:'2026-11-02T08:00:00Z'}],'America/Los_Angeles')).toEqual([{localDate:'2026-11-01',occupiedMinutes:1500}]);
 });
 it('splits at a real date boundary even when midnight itself was skipped by Sao Paulo DST',()=>{
  expect(localMinuteChoices({localDate:'2018-11-04',localTime:'00:30'},'America/Sao_Paulo')).toEqual([]);
  expect(calendarLoadByLocalDate([{startsAt:'2018-11-04T02:30:00Z',endsAt:'2018-11-04T03:30:00Z'}],'America/Sao_Paulo')).toEqual([{localDate:'2018-11-03',occupiedMinutes:30},{localDate:'2018-11-04',occupiedMinutes:30}]);
 });
 it('does not invent the skipped Samoa date when a real interval spans the date-line change',()=>{
  expect(localMinuteChoices({localDate:'2011-12-30',localTime:'12:00'},'Pacific/Apia')).toEqual([]);
  expect(calendarLoadByLocalDate([{startsAt:'2011-12-30T09:30:00Z',endsAt:'2011-12-30T10:30:00Z'}],'Pacific/Apia')).toEqual([{localDate:'2011-12-29',occupiedMinutes:30},{localDate:'2011-12-31',occupiedMinutes:30}]);
 });
 it('unions duplicated and overlapping busy intervals without mutating the source and keeps adjacent events conflict-free',()=>{
  const values=[{startsAt:'2026-10-30T10:10:00Z',endsAt:'2026-10-30T10:30:00Z'},{startsAt:'2026-10-30T10:00:00Z',endsAt:'2026-10-30T10:20:00Z'},{startsAt:'2026-10-30T10:00:00Z',endsAt:'2026-10-30T10:20:00Z'}],before=JSON.stringify(values);
  expect(unionCalendarIntervals(values)).toEqual([{startsAt:'2026-10-30T10:00:00.000Z',endsAt:'2026-10-30T10:30:00.000Z'}]);expect(JSON.stringify(values)).toBe(before);expect(calendarLoadByLocalDate(values,'UTC')).toEqual([{localDate:'2026-10-30',occupiedMinutes:30}]);
  expect(calendarIntervalsOverlap(values[0],{startsAt:'2026-10-30T10:30:00Z',endsAt:'2026-10-30T10:45:00Z'})).toBe(false);expect(calendarIntervalsOverlap(values[0],values[1])).toBe(true);
 });
 it('refuses invalid or unbounded existing intervals so missing budget is never silently treated as zero',()=>{
  for(const value of [{startsAt:'2026-10-30T10:00:00',endsAt:'2026-10-30T11:00:00'},{startsAt:'2026-10-30T11:00:00Z',endsAt:'2026-10-30T10:00:00Z'},{startsAt:'2026-10-30T10:00:00Z',endsAt:'2028-10-30T10:00:00Z'},{startsAt:'2026-02-30T10:00:00Z',endsAt:'2026-03-03T10:00:00Z'},{startsAt:'2026-10-30T24:00:00Z',endsAt:'2026-11-01T10:00:00Z'},{startsAt:'2026-10-30T10:00:00+14:30',endsAt:'2026-11-01T10:00:00Z'}])expect(()=>calendarLoadByLocalDate([value],'UTC')).toThrow(CalendarTimeError);
 });
});
