'use client';
import * as React from 'react';
import type { CourseProjectView,ProjectTeachingView } from '@study-agent/contracts';
import { apiBaseUrl,apiRequest,getAuthToken,ApiRequestError } from '../../../lib/api';
import { playReplyAudio } from '../classroom/reply-reading';

type Operation={abort:AbortController;audio:HTMLAudioElement|null;url:string;released:boolean};
export function useProjectNarration(project:CourseProjectView,stageId:string,stepId:string,onAccessLost:()=>void){
  const [view,setView]=React.useState<ProjectTeachingView|null>(null),[notice,setNotice]=React.useState(''),[loading,setLoading]=React.useState(true),[revision,reload]=React.useReducer(value=>value+1,0);
  const [state,setState]=React.useState<'idle'|'preparing'|'playing'|'paused'>('idle'),[unitIndex,setUnitIndex]=React.useState(0),[voice,setVoiceValue]=React.useState(''),[speed,setSpeedValue]=React.useState(1);
  const operation=React.useRef<Operation|null>(null),mounted=React.useRef(true),cursor=React.useRef(0),rate=React.useRef(speed);rate.current=speed;
  const accessLost=React.useRef(onAccessLost);accessLost.current=onAccessLost;
  const step=view?.stages.find(stage=>stage.stageId===stageId)?.steps.find(step=>step.id===stepId);
  function release(value:Operation){if(value.released)return;value.released=true;value.abort.abort();if(value.audio){value.audio.onended=null;value.audio.onerror=null;value.audio.pause();}if(value.url)URL.revokeObjectURL(value.url);if(operation.current===value)operation.current=null;}
  function stop(){if(operation.current)release(operation.current);cursor.current=0;if(mounted.current){setState('idle');setUnitIndex(0);}}
  function pause(){if(operation.current)release(operation.current);setState('paused');}
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(operation.current)release(operation.current);};},[]);
  React.useEffect(()=>{const controller=new AbortController();setLoading(true);setNotice('');setView(null);
    apiRequest<ProjectTeachingView>('/learning/projects/'+encodeURIComponent(project.id)+'/teaching',{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted)return;
      if(value.projectId!==project.id||value.definitionFingerprint!==project.definition.fingerprint)throw new Error('项目讲解已变化，请重新读取项目。');
      setView(value);let preferred='';try{const preferences=JSON.parse(localStorage.getItem('studyagent.classroom.preferences')??'{}');preferred=typeof preferences.voice==='string'?preferences.voice:'';if([0.5,0.75,1,1.25,1.5,2].includes(preferences.speed))setSpeedValue(preferences.speed);}catch{/* Optional audio preferences. */}
      setVoiceValue(value.speech.voices.some(voice=>voice.id===preferred)?preferred:value.speech.voices.find(voice=>voice.id===value.speech.defaultVoice)?.id??value.speech.voices[0]?.id??'');
    }).catch(error=>{if(!controller.signal.aborted){if(error instanceof ApiRequestError&&[401,403].includes(error.status)){stop();setView(null);accessLost.current();}else setNotice((error as Error).message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[project.id,project.definition.fingerprint,revision]);
  React.useEffect(()=>{stop();return stop;},[project.id,stageId,stepId,project.definition.fingerprint]);
  React.useEffect(()=>{if(operation.current?.audio)operation.current.audio.playbackRate=speed;},[speed]);
  function preference(next:Record<string,unknown>){try{const previous=JSON.parse(localStorage.getItem('studyagent.classroom.preferences')??'{}');localStorage.setItem('studyagent.classroom.preferences',JSON.stringify({...previous,...next}));}catch{/* Audio remains usable without local preferences. */}}
  function setVoice(value:string){stop();setVoiceValue(value);preference({voice:value});}
  function setSpeed(value:number){if(![0.5,0.75,1,1.25,1.5,2].includes(value))return;setSpeedValue(value);preference({speed:value});}
  async function play(){
    if(!view||!step||!view.speech.available||!voice)return;const start=state==='paused'?cursor.current:0;stop();cursor.current=start;
    const current:Operation={abort:new AbortController(),audio:null,url:'',released:false};operation.current=current;setNotice('');
    try{for(let index=start;index<step.speech.units.length;index++){
      if(current.abort.signal.aborted)return;cursor.current=index;setUnitIndex(index);setState('preparing');const unit=step.speech.units[index],token=getAuthToken();
      const response=await fetch(apiBaseUrl+'/api/learning/projects/'+encodeURIComponent(project.id)+'/narration',{method:'POST',credentials:'include',signal:current.abort.signal,
        headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({version:view.version,definitionFingerprint:view.definitionFingerprint,stageId,stepId,sentenceIndex:index,unitId:unit.id,voice})});
      if([401,403].includes(response.status)){stop();setView(null);accessLost.current();return;}
      if(!response.ok)throw new Error(response.status===409?'本步骤的讲解版本已变化，请重新读取朗读设置。':'朗读暂不可用，可以重试或继续阅读文字。');
      const blob=await response.blob();if(current.abort.signal.aborted||!mounted.current)return;if(!blob.type.startsWith('audio/'))throw new Error('没有取得可播放的声音，可以继续阅读文字。');
      current.url=URL.createObjectURL(blob);current.audio=new Audio(current.url);current.audio.playbackRate=rate.current;setState('playing');
      await playReplyAudio(current.audio,current.abort.signal);if(current.url)URL.revokeObjectURL(current.url);current.url='';current.audio=null;
    }}catch(error){if(!current.abort.signal.aborted&&mounted.current)setNotice((error as Error).message);}
    finally{if(operation.current===current){release(current);cursor.current=0;if(mounted.current){setState('idle');setUnitIndex(0);}}else release(current);}
  }
  return{view,step,notice,loading,state,unitIndex,voice,speed,setVoice,setSpeed,play,pause,stop,reload:()=>{stop();reload();}};
}
