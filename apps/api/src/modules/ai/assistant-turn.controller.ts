import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantTurnService } from './assistant-turn.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant')
export class AssistantTurnController {
  constructor(private readonly turns:AssistantTurnService){}
  @Get('history') history(@Req() r:AuthenticatedRequest,@Query() q:unknown){return this.turns.history(r.user,q);}
  @Get('sessions/:sessionId/context') context(@Req() r:AuthenticatedRequest,@Param('sessionId') id:string){return this.turns.context(r.user,id);}
  @Get('sessions/:sessionId/messages/page') page(@Req() r:AuthenticatedRequest,@Param('sessionId') id:string,@Query() q:unknown){return this.turns.page(r.user,id,q);}
  @Get('sessions/:sessionId/turns') list(@Req() r:AuthenticatedRequest,@Param('sessionId') id:string,@Query() q:unknown){return this.turns.list(r.user,id,q);}
  @Get('sessions/:sessionId/turns/:id') get(@Req() r:AuthenticatedRequest,@Param('sessionId') sessionId:string,@Param('id') id:string){return this.turns.get(r.user,sessionId,id);}
  @Post('sessions/:sessionId/turns') create(@Req() r:AuthenticatedRequest,@Param('sessionId') id:string,@Body() body:unknown){return this.turns.create(r.user,id,body,r.authSession);}
  @Post('sessions/:sessionId/turns/:id/cancel') cancel(@Req() r:AuthenticatedRequest,@Param('sessionId') s:string,@Param('id') id:string,@Body() body:unknown){return this.turns.control(r.user,s,id,'cancel',body);}
  @Post('sessions/:sessionId/turns/:id/retry') retry(@Req() r:AuthenticatedRequest,@Param('sessionId') s:string,@Param('id') id:string,@Body() body:unknown){return this.turns.control(r.user,s,id,'retry',body);}
}
