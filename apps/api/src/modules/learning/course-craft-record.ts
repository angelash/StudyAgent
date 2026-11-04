import type { CourseCraftView, CourseCraftQuestion, CourseCraftSource, CourseCraftAnswer, StudioSubject } from '@study-agent/contracts';
import type { TopicWhiteboardAuthorization } from './topic-whiteboard-record';
export type CourseCraftRecord = {
  id:string; ownerUserId:string; studentId:string|null; subject:StudioSubject|null;
  prompt:string; modelId:string; modelName:string; requestKey:string; requestHash:string;
  authorization:TopicWhiteboardAuthorization; revision:number; taskId:string;
  status:CourseCraftView['status']; title:string|null; overview:string|null;
  sources:CourseCraftSource[]; questions:CourseCraftQuestion[]; answers:CourseCraftAnswer['answers']|null;
  scale:CourseCraftAnswer['scale']|null; courseId:string|null; createdAt:string; updatedAt:string;
  commands:Array<{key:string;hash:string;kind:string}>;
};
export const craftTaskKind='learning.course-craft.prepare';
export function courseCraftPublic(row:CourseCraftRecord):CourseCraftView {
  const {id,prompt,modelId,modelName,studentId,subject,revision,status,title,overview,sources,questions,answers,scale,courseId,createdAt,updatedAt}=row;
  return structuredClone({id,prompt,modelId,modelName,studentId,subject,revision,status,title,overview,sources,questions,answers,scale,courseId,error:null,createdAt,updatedAt});
}
