import { Body,Controller,Get,Param,Post,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantTeachingAssignmentService } from './assistant-teaching-assignment.service';
import { AssistantTeachingStudentService } from './assistant-teaching-student.service';
@UseGuards(AuthGuard)
@Controller('learning/teaching-practice')
export class AssistantTeachingAssignmentController{
 constructor(private readonly assignments:AssistantTeachingAssignmentService,private readonly students:AssistantTeachingStudentService){}
 @Post('practices/:id/assignments') assign(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.assignments.assign(req.user,id,body,req.authSession);}
 @Get('assignments') list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.assignments.list(req.user,query,req.authSession);}
 @Get('assignments/:id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.assignments.get(req.user,id,req.authSession);}
 @Get('assignments/:id/questions/:qid/reference') reference(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('qid')qid:string){return this.assignments.reference(req.user,id,qid,req.authSession);}
 @Post('assignments/:id/start') start(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.students.start(req.user,id,body,req.authSession);}
 @Post('assignments/:id/withdraw') withdraw(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.assignments.withdraw(req.user,id,body,req.authSession);}
}
