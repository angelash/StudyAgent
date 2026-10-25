import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { GuidanceModelService } from './guidance-model.service';

@UseGuards(AuthGuard)
@Controller('diagnostics/plans/:planId/model-suggestions')
export class GuidanceModelController {
  constructor(private readonly suggestions:GuidanceModelService) {}
  @Post() create(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Body() body:unknown){return this.suggestions.create(req.user,planId,body);}
  @Get() list(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Query() query:unknown){return this.suggestions.list(req.user,planId,query);}
  @Get(':id') get(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Param('id') id:string){return this.suggestions.get(req.user,planId,id);}
  @Post(':id/cancel') cancel(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Param('id') id:string,@Body() body:unknown){return this.suggestions.control(req.user,planId,id,'cancel',body);}
  @Post(':id/retry') retry(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Param('id') id:string,@Body() body:unknown){return this.suggestions.control(req.user,planId,id,'retry',body);}
  @Post(':id/adopt') adopt(@Req() req:AuthenticatedRequest,@Param('planId') planId:string,@Param('id') id:string,@Body() body:unknown){return this.suggestions.adopt(req.user,planId,id,body);}
}
