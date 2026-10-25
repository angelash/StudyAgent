import { Body,Controller,Get,Param,Post,Patch,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { SourceCourseCheckService } from './source-course-check.service';
@UseGuards(AuthGuard)
@Controller('learning/source-courses/:courseId/checks')
export class SourceCourseCheckController{
  constructor(private readonly checks:SourceCourseCheckService){}
  @Get() list(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string){return this.checks.list(req.user,courseId);}
  @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string){return this.checks.get(req.user,courseId,id);}
  @Get(':id/requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Param('key')key:string){return this.checks.receipt(req.user,courseId,id,key);}
  @Post('preflight') preflight(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Body()body:unknown){return this.checks.preflight(req.user,courseId,body);}
  @Post('prepare') prepare(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Body()body:unknown){return this.checks.prepare(req.user,courseId,body,req.authSession);}
  @Post(':id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.control(req.user,courseId,id,'cancel',body,req.authSession);}
  @Post(':id/retry') retry(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.control(req.user,courseId,id,'retry',body,req.authSession);}
  @Post(':id/authoring') authoring(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.authoring(req.user,courseId,id,body,req.authSession);}
  @Patch(':id/content') content(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.edit(req.user,courseId,id,body,req.authSession);}
  @Post(':id/confirm') confirm(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.publish(req.user,courseId,id,body,req.authSession);}
  @Post(':id/withdraw') withdraw(@Req()req:AuthenticatedRequest,@Param('courseId')courseId:string,@Param('id')id:string,@Body()body:unknown){return this.checks.withdraw(req.user,courseId,id,body,req.authSession);}
}
