import { BadRequestException,Body,Controller,Get,Param,Post,Put,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { StudioMaterialUploadService } from './studio-material-upload.service';
@UseGuards(AuthGuard)
@Controller('learning/material-uploads')
export class StudioMaterialUploadController {
  constructor(private readonly uploads:StudioMaterialUploadService){}
  @Get() list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.uploads.list(req.user,query);}
  @Post() start(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.uploads.start(req.user,body,req.authSession);}
  @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.get(req.user,id);}
  @Put(':id/chunks/:index') chunk(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('index')index:string,@Body()body:unknown){if(!/^\d+$/u.test(index))throw new BadRequestException('分块序号无效');return this.uploads.chunk(req.user,id,Number(index),body);}
  @Post(':id/complete') complete(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.complete(req.user,id);}
  @Post(':id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.uploads.cancel(req.user,id,body);}
}
