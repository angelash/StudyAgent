import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards,UseInterceptors,UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { SourceCourseService } from './source-course.service';
import { StudioMaterialUploadService } from './studio-material-upload.service';
@UseGuards(AuthGuard)
@Controller('learning/source-courses')
export class SourceCourseController {
  constructor(private readonly courses:SourceCourseService,private readonly uploads:StudioMaterialUploadService){}
  @Get('materials') materials(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.courses.materials(req.user,query);}
  @Get('materials/:id/progress') materialProgress(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.progress(req.user,id);}
  @Get('materials/:id') material(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.material(req.user,id);}
  @Get('materials/:id/pages/:page') materialPage(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('page')page:string,@Query()query:unknown){return this.uploads.page(req.user,id,Number(page),query);}
  @Post('materials/:id/process/cancel') cancelMaterialProcessing(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.uploads.cancelProcessing(req.user,id,body);}
  @Post('materials/text') text(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.courses.addText(req.user,body);}
  @Post('materials/text-file') @UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:1024*1024,files:1}}))
  textFile(@Req()req:AuthenticatedRequest,@Body()body:unknown,@UploadedFile()file:Express.Multer.File|undefined){return this.courses.addTextFile(req.user,file,body);}
  @Get() list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.courses.list(req.user,query);}
  @Post() create(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.courses.create(req.user,body);}
  @Post('preflight') preflight(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.courses.preflight(req.user,body);}
  @Get(':id/progress') progress(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.courses.progress(req.user,id);}
  @Get(':id/sources/:key') source(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('key')key:string){return this.courses.source(req.user,id,key);}
  @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.courses.get(req.user,id);}
  @Post(':id/authoring') authoring(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.courses.authoring(req.user,id);}
  @Post(':id/lessons/:lessonId/authoring') lessonAuthoring(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('lessonId')lessonId:string){return this.courses.lessonAuthoring(req.user,id,lessonId);}
  @Patch(':id/lessons/:lessonId/content') lessonContent(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('lessonId')lessonId:string,@Body()body:unknown){return this.courses.editLesson(req.user,id,lessonId,body);}
  @Patch(':id/content') content(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.editContent(req.user,id,body);}
  @Patch(':id') edit(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.edit(req.user,id,body);}
  @Post(':id/confirm') confirm(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.confirm(req.user,id,body);}
  @Post(':id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'cancel',body);}
  @Post(':id/retry') retry(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'retry',body);}
  @Post(':id/archive') archive(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.courses.control(req.user,id,'archive',body);}
}
