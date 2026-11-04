import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { CourseCraftService } from './course-craft.service';
@UseGuards(AuthGuard)
@Controller('learning/course-craft')
export class CourseCraftController {
  constructor(private readonly craft:CourseCraftService){}
  @Get() list(@Req() req:AuthenticatedRequest){return this.craft.list(req.user);}
  @Post() start(@Req() req:AuthenticatedRequest,@Body() body:unknown){return this.craft.start(req.user,body,req.authSession);}
  @Get(':id') get(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.craft.get(req.user,id);}
  @Post(':id/answers') answer(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.craft.answer(req.user,id,body,req.authSession);}
  @Post(':id/outline-revision') revise(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.craft.reviseOutline(req.user,id,body,req.authSession);}
  @Post(':id/outline') outline(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.craft.confirmOutline(req.user,id,body,req.authSession);}
  @Post(':id/cancel') cancel(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.craft.control(req.user,id,'cancel',body,req.authSession);}
  @Post(':id/retry') retry(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() body:unknown){return this.craft.control(req.user,id,'retry',body,req.authSession);}
}
