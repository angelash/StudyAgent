import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ClassroomService } from './classroom.service';

@UseGuards(AuthGuard)
@Controller('learning/classroom')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}
  @Get('catalog') catalog(@Req() req: AuthenticatedRequest) { return this.classroom.catalog(req.user); }
  @Post('sessions') open(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.classroom.open(req.user, input); }
  @Get('sessions/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.classroom.get(req.user, id); }
  @Patch('sessions/:id') progress(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.classroom.progress(req.user, id, input);
  }
  @Post('sessions/:id/presentation') presentation(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() input:unknown){
    return this.classroom.upgradePresentation(req.user,id,input);
  }
  @Post('sessions/:id/answers') answer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.classroom.answer(req.user, id, input);
  }
  @Post('sessions/:id/hints') hint(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.classroom.hint(req.user, id, input);
  }
  @Post('sessions/:id/messages') async ask(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) {
    const controller = new AbortController();
    const disconnect = () => { if (!req.res?.writableEnded) controller.abort(); };
    req.res?.once('close', disconnect);
    try { return await this.classroom.ask(req.user, id, input, controller.signal); }
    finally { req.res?.off('close', disconnect); }
  }
  @Post('sessions/:id/narration/:stepId') async narration(@Req() req: AuthenticatedRequest, @Param('id') id: string,
    @Param('stepId') stepId: string, @Body() input: unknown) {
    const controller=new AbortController(),disconnect=()=>{if(!req.res?.writableEnded)controller.abort();};req.res?.once('close',disconnect);
    try{return await this.classroom.narration(req.user,id,stepId,input,controller.signal);}finally{req.res?.off('close',disconnect);}
  }
}
