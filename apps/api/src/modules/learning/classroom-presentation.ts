import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { classroomSentences, classroomSpeechText, splitClassroomSpeech } from '@study-agent/contracts';
import type { ClassroomLesson, ClassroomPresentation, ClassroomSession, ClassroomSpeechSpan, ClassroomSpeechTrack, ClassroomSpeechVersion } from '@study-agent/contracts';

const digest = (text:string) => createHash('sha256').update(text).digest('hex');
const unitId = (version:ClassroomSpeechVersion,source:string,start:number,end:number) => 'speech_'+digest([version,source,start,end].join(':'));

function legacySpans(text:string):ClassroomSpeechSpan[]{
  let cursor=0;
  return classroomSentences(text).map(value=>{
    const start=text.indexOf(value,cursor);
    if(start<0)throw new ConflictException('旧字幕无法在原讲稿中定位，已保留原课堂');
    cursor=start+value.length;
    return{start,end:cursor,text:value};
  });
}

export function freezeSpeechTrack(text:string,version:ClassroomSpeechVersion='speech-v2'):ClassroomSpeechTrack{
  const sourceSha256=digest(text),spans=version==='legacy-v1'?legacySpans(text):splitClassroomSpeech(text);
  return{version,sourceSha256,units:spans.map(span=>({...span,id:unitId(version,sourceSha256,span.start,span.end)}))};
}
export function freezeClassroomPresentation(lesson:ClassroomLesson,createdAt:string,version:ClassroomSpeechVersion='speech-v2'):ClassroomPresentation{
  return{version,createdAt,tracks:Object.fromEntries(lesson.steps.map(step=>[step.id,freezeSpeechTrack(step.narration,version)]))};
}

/** A frozen result is the authority. Verify it; never repair a historical cursor by silently re-splitting. */
export function verifySpeechTrack(text:string,track:ClassroomSpeechTrack,version?:ClassroomSpeechVersion){
  if(!track||!['legacy-v1','speech-v2'].includes(track.version)||version&&track.version!==version||track.sourceSha256!==digest(text)||!Array.isArray(track.units)||!track.units.length)
    throw new ConflictException('字幕快照与原讲稿不一致，请保留当前课堂并重新读取');
  let previous=0;
  for(const unit of track.units){
    if(!Number.isSafeInteger(unit.start)||!Number.isSafeInteger(unit.end)||unit.start<previous||unit.end<=unit.start||unit.end>text.length||
      unit.id!==unitId(track.version,track.sourceSha256,unit.start,unit.end)||!unit.text||
      (track.version==='legacy-v1'?text.slice(unit.start,unit.end):classroomSpeechText(text.slice(unit.start,unit.end)))!==unit.text||
      track.version==='speech-v2'&&text.slice(previous,unit.start).trim())throw new ConflictException('字幕范围不完整，请保留当前课堂并重新读取');
    previous=unit.end;
  }
  if(track.version==='speech-v2'&&text.slice(previous).trim())throw new ConflictException('字幕正文不完整，请保留当前课堂并重新读取');
  return track;
}
export function sessionPresentation(row:Pick<ClassroomSession,'lesson'|'presentation'|'createdAt'>):ClassroomPresentation{
  const presentation=row.presentation??freezeClassroomPresentation(row.lesson,row.createdAt,'legacy-v1');
  if(!['legacy-v1','speech-v2'].includes(presentation.version)||!presentation.tracks)throw new ConflictException('当前字幕版本尚不兼容，请保留原课堂');
  for(const step of row.lesson.steps)verifySpeechTrack(step.narration,presentation.tracks[step.id],presentation.version);
  return presentation;
}
