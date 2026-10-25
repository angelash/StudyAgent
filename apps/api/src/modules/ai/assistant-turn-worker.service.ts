import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { AiService } from './ai.service';
import { assistantAuthority } from './assistant-turn.service';
import { assistantTurnKind } from './assistant-turn-record';

@Injectable()
export class AssistantTurnWorkerService implements OnApplicationBootstrap,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;private current?:Promise<boolean>;private abort?:AbortController;private stopping=false;
  private readonly logger=new Logger(AssistantTurnWorkerService.name);
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly ai:AiService){}
  onApplicationBootstrap(){if(process.env.STUDY_WORKER_ENABLED==='false'||!this.store.persistence.durable)return;
    this.timer=setInterval(()=>void this.runNext().catch(()=>this.logger.warn('Assistant turn retained')),1000);this.timer.unref();}
  async onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.abort?.abort();await this.current?.catch(()=>{});}
  async runNext(){if(this.stopping||this.current)return false;const pending=this.execute();this.current=pending;try{return await pending;}finally{this.current=undefined;}}
  private async execute(){
    const task=await this.store.tasks.claim([assistantTurnKind]);if(!task)return false;
    const id=String(task.payload.turnId??''),abort=new AbortController(),fence={id:task.id,token:task.leaseToken!};this.abort=abort;let authorityLost=false;
    const heartbeat=setInterval(()=>void this.store.tasks.heartbeat(task.id,task.leaseToken!).then(async valid=>{
      if(!valid){abort.abort();return;}await this.store.requestContext(()=>{const turn=this.store.find('assistantTurns',{id,taskId:task.id});if(!turn)throw new NotFoundException();assistantAuthority(this.store,this.students,this.ai,turn);});
    }).catch(()=>{authorityLost=true;abort.abort();}),2000);heartbeat.unref();
    try{
      const snapshot=await this.store.transaction(()=>{
        const turn=this.store.find('assistantTurns',{id,taskId:task.id,ownerUserId:task.ownerUserId});
        if(!turn||turn.status==='completed'||turn.inputHash!==task.payloadHash)throw new ConflictException('提问不可用');
        assistantAuthority(this.store,this.students,this.ai,turn);turn.status='running';turn.revision++;turn.updatedAt=new Date().toISOString();return structuredClone(turn);
      },{...fence,mode:'checkpoint',progress:{stage:'replying'}});
      const response=await this.ai.renderAssistant(snapshot.prepared,abort.signal);
      if(abort.signal.aborted)throw new Error('assistant_stopped');
      if(response.source!==snapshot.prepared.execution||response.modelId!==snapshot.prepared.modelId)throw new Error('assistant_model_changed');
      await this.store.transaction(()=>{
        const turn=this.store.find('assistantTurns',{id,taskId:task.id});if(!turn||turn.inputHash!==snapshot.inputHash)throw new ConflictException();
        assistantAuthority(this.store,this.students,this.ai,turn);turn.status='validating';turn.revision++;turn.updatedAt=new Date().toISOString();
      },{...fence,mode:'checkpoint',progress:{stage:'validating'}});
      await this.store.transaction(()=>{
        const turn=this.store.find('assistantTurns',{id,taskId:task.id,ownerUserId:task.ownerUserId});
        if(!turn||turn.status!=='validating'||turn.inputHash!==snapshot.inputHash)throw new ConflictException();
        assistantAuthority(this.store,this.students,this.ai,turn);
        const published=this.ai.publishAssistant(turn.prepared,response,turn.requestKey);
        Object.assign(turn,{userMessageId:published.userMessageId,assistantMessageId:published.assistantMessageId,status:'completed',revision:turn.revision+1,updatedAt:new Date().toISOString()});
      },{...fence,result:{turnId:id}});
    }catch(error){
      const contextChanged=authorityLost||error instanceof ForbiddenException||error instanceof ConflictException||error instanceof NotFoundException;
      await this.store.tasks.fail(task.id,task.leaseToken!,contextChanged?'assistant_context_changed':abort.signal.aborted?'assistant_turn_stopped':'assistant_turn_failed',this.stopping).catch(()=>{});
    }finally{clearInterval(heartbeat);if(this.abort===abort)this.abort=undefined;}
    return true;
  }
}
