import { Body,Controller,Get,Param,Patch,Post,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantTeachingSelfService } from './assistant-teaching-self.service';
import { AssistantTeachingStudentService } from './assistant-teaching-student.service';
@UseGuards(AuthGuard)
@Controller('learning/teaching-practice')
export class AssistantTeachingSelfController{
 constructor(private readonly practice:AssistantTeachingSelfService,private readonly students:AssistantTeachingStudentService){}
 private session(id:string){return this.students.handles(id)?this.students:this.practice;}
 @Post('practices/:id/start') start(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.practice.start(req.user,id,body,req.authSession);}
 @Get('sessions') list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.practice.list(req.user,query,req.authSession);}
 @Get('sessions/:id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.session(id).get(req.user,id,req.authSession);}
 @Get('sessions/:id/questions/:questionId') question(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('questionId')qid:string){return this.session(id).question(req.user,id,qid,req.authSession);}
 @Patch('sessions/:id/questions/:questionId/draft') draft(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('questionId')qid:string,@Body()body:unknown){return this.session(id).draft(req.user,id,qid,body,req.authSession);}
 @Post('sessions/:id/responses') response(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.session(id).respond(req.user,id,body,req.authSession);}
 @Post('sessions/:id/questions/:questionId/help') help(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('questionId')qid:string,@Body()body:unknown){return this.session(id).help(req.user,id,qid,body,req.authSession);}
 @Post('sessions/:id/complete') complete(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.session(id).complete(req.user,id,body,req.authSession);}
}
