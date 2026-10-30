import { Body,Controller,Get,Param,Patch,Post,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantGuidanceService } from './assistant-guidance.service';
@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/guidance')
export class AssistantGuidanceSourceController{
 constructor(private readonly guidance:AssistantGuidanceService){}
 @Post('preflight') preview(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Body()body:unknown){return this.guidance.preview(req.user,id,body,req.authSession);}
 @Post('intents') create(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Body()body:unknown){return this.guidance.create(req.user,id,body,req.authSession);}
 @Get('intents') list(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Query()query:unknown){return this.guidance.list(req.user,id,query,req.authSession);}
 @Get('requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Param('key')key:string){return this.guidance.creationReceipt(req.user,id,key,req.authSession);}
}
@UseGuards(AuthGuard)
@Controller('learning/assistant-guidance/intents')
export class AssistantGuidanceController{
 constructor(private readonly guidance:AssistantGuidanceService){}
 @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.guidance.get(req.user,id,req.authSession);}
 @Get(':id/requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('key')key:string){return this.guidance.get(req.user,id,req.authSession,key);}
 @Patch(':id/observation') edit(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.guidance.edit(req.user,id,body,req.authSession);}
 @Post(':id/report-preflight') reportPreview(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.guidance.reportPreview(req.user,id,body,req.authSession);}
 @Post(':id/report') report(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.guidance.linkReport(req.user,id,body,req.authSession);}
 @Post(':id/plan') plan(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.guidance.createPlan(req.user,id,body,req.authSession);}
}
