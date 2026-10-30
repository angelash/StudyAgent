import { Body,Controller,Get,Param,Patch,Post,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantTeachingService } from './assistant-teaching.service';
import { AssistantTeachingSourceService } from './assistant-teaching-source.service';
@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/practice/generated')
export class AssistantTeachingSourceController{
 constructor(private readonly practice:AssistantTeachingService,private readonly source:AssistantTeachingSourceService){}
 @Post('preflight') preflight(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Body()body:unknown){return this.source.preview(req.user,id,body,req.authSession);}
 @Post('drafts') create(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Body()body:unknown){return this.practice.create(req.user,id,body,req.authSession);}
 @Get('drafts') list(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Query()query:unknown){return this.practice.list(req.user,id,query,req.authSession);}
 @Get('requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('sessionId')id:string,@Param('key')key:string){return this.practice.creationReceipt(req.user,id,key,req.authSession);}
}
@UseGuards(AuthGuard)
@Controller('learning/teaching-practice')
export class AssistantTeachingController{
 constructor(private readonly practice:AssistantTeachingService){}
 @Get('drafts/:id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.practice.get(req.user,id,req.authSession);}
 @Get('drafts/:id/source') source(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.practice.sourceView(req.user,id,req.authSession);}
 @Get('drafts/:id/requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('key')key:string){return this.practice.get(req.user,id,req.authSession,key);}
 @Patch('drafts/:id/content') edit(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.edit(req.user,id,body,req.authSession);}
 @Post('drafts/:id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.control(req.user,id,'cancel',body,req.authSession);}
 @Post('drafts/:id/retry') retry(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.control(req.user,id,'retry',body,req.authSession);}
 @Post('drafts/:id/review') review(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.review(req.user,id,body,req.authSession);}
 @Post('drafts/:id/adopt') adopt(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.adopt(req.user,id,body,req.authSession);}
 @Get('practices/:id') adopted(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.practice.practice(req.user,id,req.authSession);}
}
