import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import type { StudioSpeechVoice } from '@study-agent/contracts';
import { workspaceRoot } from '../../infrastructure/workspace-paths';

export const neutralVoiceVersion='neutral-voice-2026-10-25.1';
export const neutralVoiceText='我们先把问题看清楚，一步一步来，再用新的例子验证。';
export const neutralVoiceModel='speech-2.8-turbo';
export const classroomVoicePresets:StudioSpeechVoice[]=[
  {id:'Chinese (Mandarin)_Warm_Girl',label:'温暖少女',classroomPreset:'warm',description:'温暖少女',language:'普通话'},
  {id:'Chinese (Mandarin)_Gentleman',label:'温润男声',classroomPreset:'calm',description:'温润男声',language:'普通话'},
  {id:'Chinese (Mandarin)_Crisp_Girl',label:'清脆少女',classroomPreset:'bright',description:'清脆少女',language:'普通话'},
  {id:'Chinese (Mandarin)_Gentle_Senior',label:'温柔学姐',classroomPreset:'gentle',description:'温柔学姐',language:'普通话'},
  {id:'Chinese (Mandarin)_Male_Announcer',label:'播报男声',classroomPreset:'professional',description:'播报男声',language:'普通话'},
  {id:'qiaopi_mengmei',label:'俏皮萌妹',classroomPreset:'lively',description:'俏皮萌妹',language:'普通话'},
];

/** Only fixed original neutral assets are eligible; never accepts a client path or text. */
export function readNeutralVoiceSample(voiceId:string):Buffer|null {
  const voice=classroomVoicePresets.find(row=>row.id===voiceId);if(!voice)return null;
  try {
    const directory=resolve(workspaceRoot(),'apps/web/public/classroom-voice-samples');
    const manifest=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
    if(manifest.format!=='study-agent-neutral-voice-samples-v1'||manifest.version!==neutralVoiceVersion||manifest.text!==neutralVoiceText||manifest.model!==neutralVoiceModel||!Array.isArray(manifest.voices))throw Error('Invalid neutral sample manifest');
    const rows=manifest.voices.filter((row:any)=>row.voiceId===voiceId),row=rows[0];
    if(rows.length!==1||row.preset!==voice.classroomPreset||row.file!==voice.classroomPreset+'-v1.mp3'||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>200000||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Invalid neutral sample identity');
    const content=readFileSync(resolve(directory,row.file));
    if(content.length!==row.bytes||createHash('sha256').update(content).digest('hex')!==row.sha256)throw Error('Neutral sample integrity failed');
    return content;
  }catch{throw new ServiceUnavailableException('固定音色样本暂不可用，仍可继续文字学习或试听已出现的当前句');}
}
