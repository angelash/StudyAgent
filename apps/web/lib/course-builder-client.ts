import { apiRequest, ApiRequestError } from './api';
import type { StudioCourse } from '@study-agent/contracts';
import { assertCourseBuilderPending, courseBuilderReceipt, courseBuilderValueHash, type CourseBuilderOwner, type CourseBuilderPending } from './course-builder-copy';

export type CourseBuilderTransport=(path:string,options:RequestInit)=>Promise<unknown>;
export type CourseBuilderLookup={verified:true;entry:CourseBuilderPending;course:StudioCourse}|{verified:false;entry:CourseBuilderPending;course:null};
const stopped=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('原课程操作已停止，完整原请求继续保留。','AbortError');};
const message=(error:unknown)=>(error instanceof Error?error.message:'原课程结果暂时不能核对，请保留完整原请求。').slice(0,2000);
const uncertain=(entry:CourseBuilderPending,reason:string):CourseBuilderPending=>({...structuredClone(entry),phase:entry.result?'received':'unknown',message:reason.slice(0,2000)});
async function received(owner:CourseBuilderOwner,entry:CourseBuilderPending,value:unknown,confirmed:boolean){
 const course=value as StudioCourse,receipt=courseBuilderReceipt(course);
 if(entry.result&&await courseBuilderValueHash(entry.result)!==await courseBuilderValueHash(receipt))throw Error('服务器原课程与本机原回执不同，保留两份信息后核对，未自动覆盖。');
 return assertCourseBuilderPending(owner,{...entry,phase:confirmed?'confirmed':'received',result:receipt,message:''});
}
/** A null result never proves an earlier creation cannot still complete. */
export async function lookupCourseBuilderCommand(owner:CourseBuilderOwner,value:CourseBuilderPending,signal?:AbortSignal,transport:CourseBuilderTransport=apiRequest):Promise<CourseBuilderLookup>{
 stopped(signal);const entry=await assertCourseBuilderPending(owner,value),result=await transport('/learning/studio/courses/requests/'+encodeURIComponent(entry.input.requestKey),{signal,headers:{'X-Study-Actor':owner.actorId}});stopped(signal);
 if(result===null)return{verified:false,entry:uncertain(entry,'暂未查到原创建结果，原请求仍可能稍后完成。请继续核对或用同一份完整原请求恢复。'),course:null};
 if(!result||typeof result!=='object'||Object.keys(result).sort().join(',')!=='course,requestHash,requestKey')throw Error('服务器原课程回执不完整，当前完整输入仍保留。');
 const original=result as{requestKey:string;requestHash:string;course:StudioCourse};if(original.requestKey!==entry.input.requestKey||original.requestHash!==entry.requestHash)throw Error('这个请求标识对应另一份完整课程输入，没有重发或替换当前稿。');
 const confirmed=await received(owner,entry,original.course,true);stopped(signal);return{verified:true,entry:confirmed,course:structuredClone(original.course)};
}
/** Retain the complete form+command through the caller before any POST. A POST
 * receipt is only received; current authorization and original hash are looked
 * up independently before opening a course or permitting another creation. */
export async function sendCourseBuilderCommand(owner:CourseBuilderOwner,value:CourseBuilderPending,retain:(entry:CourseBuilderPending)=>Promise<void>,signal?:AbortSignal,transport:CourseBuilderTransport=apiRequest):Promise<CourseBuilderLookup>{
 stopped(signal);let rejection:string|null=null,entry=uncertain(await assertCourseBuilderPending(owner,value),'正在提交原创建请求，请保留同一份完整输入。');await retain(structuredClone(entry));stopped(signal);
 try{const result=await transport('/learning/studio/courses',{method:'POST',body:JSON.stringify(entry.input),signal,headers:{'X-Study-Actor':owner.actorId}});stopped(signal);entry=await received(owner,entry,result,false);await retain(structuredClone(entry));stopped(signal);}
 catch(error){stopped(signal);entry=uncertain(entry,message(error));await retain(structuredClone(entry));stopped(signal);if(error instanceof ApiRequestError&&[401,403].includes(error.status))throw error;
  // The service answered and refused this exact command; with no stored original result it created no course.
  if(error instanceof ApiRequestError&&error.status>=400&&error.status<500&&![408,425,429].includes(error.status))rejection=message(error);}
 try{const result=await lookupCourseBuilderCommand(owner,entry,signal,transport);if(!result.verified&&rejection){const rejected=await assertCourseBuilderPending(owner,{...result.entry,phase:'rejected',result:null,message:rejection});await retain(structuredClone(rejected));stopped(signal);return{verified:false,entry:rejected,course:null};}
  await retain(structuredClone(result.entry));stopped(signal);return result;}
 catch(error){stopped(signal);entry=uncertain(entry,message(error));await retain(structuredClone(entry));stopped(signal);if(error instanceof ApiRequestError&&[401,403].includes(error.status))throw error;return{verified:false,entry,course:null};}
}
