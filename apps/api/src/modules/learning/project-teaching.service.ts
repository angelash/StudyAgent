import { BadRequestException,ConflictException,ForbiddenException,Injectable,StreamableFile,UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { projectTeachingSteps,projectTeachingVersion,type ProjectTeachingView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { SpeechService } from '../ai/speech.service';
import { captureProjectFileAuthorization,courseProjectRecord } from './course-project-access';
import { generationDigest } from './source-course-pipeline';
import { freezeSpeechTrack } from './classroom-presentation';

@Injectable()
export class ProjectTeachingService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly speech:SpeechService){}
  private context(user:InMemoryUserAccount,id:string,session:InMemoryAuthSession){
    const currentSession=this.store.find('sessions',{tokenHash:session.tokenHash,userId:user.id});
    if(!currentSession||currentSession.revokedAt||Date.parse(currentSession.expiresAt)<=Date.now())throw new UnauthorizedException('原登录已失效，请重新登录');
    const actor=this.store.find('users',{id:user.id,status:'active',role:user.role});if(!actor)throw new ForbiddenException('原项目身份已变化');
    const row=courseProjectRecord(this.store,this.students,actor,id),authorization=captureProjectFileAuthorization(this.store,row,actor,currentSession);
    return{row,definitionHash:generationDigest(row.definition),authorizationHash:generationDigest(authorization)};
  }
  get(user:InMemoryUserAccount,id:string,session:InMemoryAuthSession):ProjectTeachingView{
    const {row}=this.context(user,id,session);
    return{version:projectTeachingVersion,projectId:row.id,definitionFingerprint:row.definition.fingerprint,speech:this.speech.capabilities(),
      stages:row.definition.stages.map(stage=>({stageId:stage.id,steps:projectTeachingSteps(stage).map(step=>({...step,speech:freezeSpeechTrack(step.instruction)}))}))};
  }
  async narrate(user:InMemoryUserAccount,id:string,session:InMemoryAuthSession,input:unknown,signal:AbortSignal){
    const command=validate(z.object({version:z.literal(projectTeachingVersion),definitionFingerprint:z.string().min(1).max(200),stageId:z.string().min(1).max(200),
      stepId:z.string().min(1).max(400),sentenceIndex:z.number().int().min(0),unitId:z.string().min(1).max(100),voice:z.string().min(1).max(120).optional()}).strict(),input);
    if(signal.aborted)throw new BadRequestException('项目朗读已停止');
    const initial=await this.store.transaction(()=>this.context(user,id,session));
    if(initial.row.definition.fingerprint!==command.definitionFingerprint)throw new ConflictException('项目定义已变化，请重新读取本步骤');
    const stage=initial.row.definition.stages.find(stage=>stage.id===command.stageId),step=stage&&projectTeachingSteps(stage).find(step=>step.id===command.stepId);
    if(!step)throw new BadRequestException('这个项目中没有所选教学步骤');
    const unit=freezeSpeechTrack(step.instruction).units[command.sentenceIndex];
    if(!unit||unit.id!==command.unitId)throw new ConflictException('本步骤的讲解版本已变化，请重新读取');
    if(command.voice&&!this.speech.capabilities().voices.some(voice=>voice.id===command.voice))throw new BadRequestException('项目音色已变化，请重新选择');
    const audio=await this.speech.synthesize(unit.text,command.voice,signal);
    if(signal.aborted)throw new BadRequestException('项目朗读已停止');
    await this.store.transaction(()=>{const current=this.context(user,id,session);if(current.definitionHash!==initial.definitionHash||current.authorizationHash!==initial.authorizationHash)throw new ConflictException('原项目内容或授权已变化，请重新进入项目');});
    return new StreamableFile(audio.content,{type:audio.contentType,disposition:'inline',length:audio.content.length});
  }
}
