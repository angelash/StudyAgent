import {Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthenticatedRequest} from '../../common/auth.guard';
import {StudioOriginalRepairService} from './studio-original-repair.service';
@UseGuards(AuthGuard)
@Controller('learning/source-courses/materials/:materialId/repairs')
export class StudioOriginalRepairController{
 constructor(private readonly repairs:StudioOriginalRepairService){}
 @Get() list(@Req()req:AuthenticatedRequest,@Param('materialId')materialId:string){return this.repairs.list(req.user,materialId);}
 @Get(':id') get(@Req()req:AuthenticatedRequest,@Param('materialId')materialId:string,@Param('id')id:string){return this.repairs.get(req.user,materialId,id);}
 @Post() start(@Req()req:AuthenticatedRequest,@Param('materialId')materialId:string,@Body()body:unknown){return this.repairs.start(req.user,materialId,body,req.authSession);}
 @Post(':id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('materialId')materialId:string,@Param('id')id:string,@Body()body:unknown){return this.repairs.control(req.user,materialId,id,'cancel',body);}
 @Post(':id/retry') retry(@Req()req:AuthenticatedRequest,@Param('materialId')materialId:string,@Param('id')id:string,@Body()body:unknown){return this.repairs.control(req.user,materialId,id,'retry',body);}
}
