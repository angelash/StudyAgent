import { z } from 'zod';
import { projectTeachingSteps,type CourseProjectView } from '@study-agent/contracts';
type ProjectLocation={version:1;ownerId:string;projectId:string;definitionFingerprint:string;stageId:string;stepId:string;view:'guided'|'complete'};
const id=z.string().min(1).max(400),schema=z.object({version:z.literal(1),ownerId:id,projectId:id,definitionFingerprint:id,stageId:id,stepId:id,view:z.enum(['guided','complete'])}).strict();
const key=(owner:string,row:CourseProjectView)=>'studyagent.project.location.v1.'+JSON.stringify([owner,row.id,row.definition.fingerprint]);
export function readProjectLocation(owner:string,row:CourseProjectView):ProjectLocation|null{
  try{const raw=localStorage.getItem(key(owner,row));if(!raw)return null;const value=schema.parse(JSON.parse(raw)),stage=row.definition.stages.find(stage=>stage.id===value.stageId);
    return value.ownerId===owner&&value.projectId===row.id&&value.definitionFingerprint===row.definition.fingerprint&&stage&&projectTeachingSteps(stage).some(step=>step.id===value.stepId)?value:null;
  }catch{return null;}
}
export function writeProjectLocation(owner:string,row:CourseProjectView,stageId:string,stepId:string,view:'guided'|'complete'){
  const stage=row.definition.stages.find(stage=>stage.id===stageId);if(!stage||!projectTeachingSteps(stage).some(step=>step.id===stepId))return false;
  try{const value:ProjectLocation={version:1,ownerId:owner,projectId:row.id,definitionFingerprint:row.definition.fingerprint,stageId,stepId,view};localStorage.setItem(key(owner,row),JSON.stringify(value));return true;}catch{return false;}
}
