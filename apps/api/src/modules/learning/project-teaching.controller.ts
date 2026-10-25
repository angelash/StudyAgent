import { Body,Controller,Get,Param,Post,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,AuthenticatedRequest } from '../../common/auth.guard';
import { ProjectTeachingService } from './project-teaching.service';

@UseGuards(AuthGuard)
@Controller('learning/projects')
export class ProjectTeachingController {
  constructor(private readonly teaching:ProjectTeachingService){}
  @Get(':id/teaching')get(@Req() req:AuthenticatedRequest,@Param('id')id:string){return this.teaching.get(req.user,id,req.authSession);}
  @Post(':id/narration')async narrate(@Req() req:AuthenticatedRequest,@Param('id')id:string,@Body()input:unknown){
    const controller=new AbortController(),disconnect=()=>{if(!req.res?.writableEnded)controller.abort();};req.res?.once('close',disconnect);
    try{return await this.teaching.narrate(req.user,id,req.authSession,input,controller.signal);}finally{req.res?.off('close',disconnect);}
  }
}
