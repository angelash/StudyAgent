import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { streamFile } from '../../common/stream-file';
import { ProjectFileService } from './project-file.service';

@Controller('learning/project-files')
@UseGuards(AuthGuard)
export class ProjectFileController {
  constructor(private readonly files:ProjectFileService){}
  @Get() list(@Req() req:AuthenticatedRequest,@Query('projectId') projectId:string,@Query('stageId') stageId:string){if(!projectId||!stageId)throw new BadRequestException('请选择项目阶段');return this.files.list(req.user,projectId,stageId);}
  @Post('uploads') start(@Req() req:AuthenticatedRequest,@Body() input:unknown){return this.files.start(req.user,input,req.authSession);}
  @Get('uploads/:id') upload(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.files.getUpload(req.user,id);}
  @Put('uploads/:id/chunks/:index') chunk(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('index') index:string,@Body() input:unknown){if(!/^\d+$/.test(index))throw new BadRequestException('分块序号不正确');return this.files.chunk(req.user,id,Number(index),input);}
  @Post('uploads/:id/complete') complete(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.files.complete(req.user,id);}
  @Post('uploads/:id/cancel') cancelUpload(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() input:unknown){return this.files.cancelUpload(req.user,id,input);}
  @Get('assets/:id') asset(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.files.getAsset(req.user,id);}
  @Get('assets/:id/integrity') integrity(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.files.integrity(req.user,id);}
  @Post('assets/:id/cancel') cancel(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() input:unknown){return this.files.command(req.user,id,'cancel',input);}
  @Post('assets/:id/retry') retry(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() input:unknown){return this.files.command(req.user,id,'retry',input);}
  @Post('assets/:id/delete') delete(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() input:unknown){return this.files.command(req.user,id,'delete',input);}
  @Get('assets/:id/files/:variant') async file(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Param('variant') variant:string,@Headers('range') range:string|undefined,@Res({passthrough:true}) response:Response){return streamFile(await this.files.file(req.user,id,variant),range,response);}
}
