import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { SourceCourseService } from './source-course.service';
@UseGuards(AuthGuard)
@Controller('learning/source-courses')
export class SourceCourseController {
  constructor(private readonly courses:SourceCourseService){}
  @Get('materials') materials(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.courses.materials(req.user,query);}
  @Post('materials/text') text(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.courses.addText(req.user,body);}
  @Get() list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.courses.list(req.user,query);}
  @Post() create(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.courses.create(req.user,body);}
  @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.courses.get(req.user,id);}
  @Patch(':id') edit(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.edit(req.user,id,body);}
  @Post(':id/confirm') confirm(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.confirm(req.user,id,body);}
  @Post(':id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'cancel',body);}
  @Post(':id/retry') retry(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'retry',body);}
  @Post(':id/archive') archive(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'archive',body);}
}
