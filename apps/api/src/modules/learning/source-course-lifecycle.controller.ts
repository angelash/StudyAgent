import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { SourceCourseLifecycleService } from './source-course-lifecycle.service';

@UseGuards(AuthGuard)
@Controller('learning/source-courses')
export class SourceCourseLifecycleController {
  constructor(private readonly lifecycle:SourceCourseLifecycleService){}
  @Get(':id/versions') versions(@Req()request:AuthenticatedRequest,@Param('id')id:string){return this.lifecycle.versions(request.user,id);}
  @Post(':id/revisions') revise(@Req()request:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.lifecycle.revise(request.user,id,body);}
  @Post(':id/lifecycle/preview') preview(@Req()request:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.lifecycle.preview(request.user,id,body);}
  @Post(':id/lifecycle') apply(@Req()request:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.lifecycle.apply(request.user,id,body);}
}
