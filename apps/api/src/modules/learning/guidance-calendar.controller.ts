import { Body,Controller,Get,Param,Post,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../../common/auth.guard';
import { GuidanceCalendarService } from './guidance-calendar.service';

@UseGuards(AuthGuard)
@Controller('learning/guidance-calendar')
export class GuidanceCalendarController{
 constructor(private readonly calendar:GuidanceCalendarService){}
 @Post('preflight') preflight(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.calendar.preflight(req.user,body);}
 @Post('arrangements') confirm(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.calendar.confirm(req.user,body);}
 @Get('requests/:key') receipt(@Req()req:AuthenticatedRequest,@Param('key')key:string){return this.calendar.receipt(req.user,key);}
 @Get('plans/:planId') forPlan(@Req()req:AuthenticatedRequest,@Param('planId')id:string){return this.calendar.forPlan(req.user,id);}
 @Get('arrangements/:id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.calendar.get(req.user,id);}
 @Post('arrangements/:id/revisions') revise(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.calendar.revise(req.user,id,body);}
}
