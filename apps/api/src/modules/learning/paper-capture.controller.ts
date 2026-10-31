import {BadRequestException,Body,Controller,Get,HttpCode,Param,Post,Put,Query,Req,Res,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import type {PaperCaptureLimits} from '@study-agent/contracts';
import {AuthGuard,type AuthenticatedRequest} from '../../common/auth.guard';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureUploadService} from './paper-capture-upload.service';
import {PaperCapturePageService} from './paper-capture-page.service';
import {PaperCaptureGroupService} from './paper-capture-group.service';
import {PaperCaptureDerivationService} from './paper-capture-derivation.service';
import {PaperCaptureIntegrityService} from './paper-capture-integrity.service';
import {PaperCaptureRepairService} from './paper-capture-repair.service';
@UseGuards(AuthGuard)
@Controller('learning/paper-captures')
export class PaperCaptureController{
 constructor(private readonly uploads:PaperCaptureUploadService,private readonly commands:PaperCaptureCommandService,private readonly pages:PaperCapturePageService,private readonly groups:PaperCaptureGroupService,private readonly derivations:PaperCaptureDerivationService,private readonly integrity:PaperCaptureIntegrityService,private readonly repairs:PaperCaptureRepairService){}
 @Get('repair-commands/:requestKey') repairCommand(@Req()req:AuthenticatedRequest,@Param('requestKey')key:string){return this.repairs.command(req.user,key);}
 @Post('repair-candidates') @HttpCode(200) async repairCandidate(@Req()req:AuthenticatedRequest,@Body()body:unknown,@Res({passthrough:true})response:Response){const {bytes,candidate}=await this.integrity.repairCandidate(req.user,body,req.authSession);response.setHeader('x-study-paper-candidate',Buffer.from(JSON.stringify(candidate)).toString('base64'));response.setHeader('Access-Control-Expose-Headers','x-study-paper-candidate');return new StreamableFile(bytes,{type:candidate.selection.mediaType,disposition:'attachment',length:bytes.length});}
 @Get('repair-uploads') repairUploads(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.repairs.listUploads(req.user,query);}
 @Post('repair-uploads') repairUpload(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.repairs.startUpload(req.user,body,req.authSession);}
 @Get('repair-uploads/:id') repairUploadProgress(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.repairs.getUpload(req.user,id);}
 @Put('repair-uploads/:id/chunks/:index') repairChunk(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('index')index:string,@Body()body:unknown){if(!/^\d+$/.test(index))throw new BadRequestException('恢复分块序号无效。');return this.repairs.chunk(req.user,id,Number(index),body);}
 @Post('repair-uploads/:id/cancel') cancelRepairUpload(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.repairs.cancelUpload(req.user,id,body,req.authSession);}
 @Get('repairs') repairList(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.repairs.list(req.user,query);}
 @Post('repairs') repairStart(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.repairs.start(req.user,body,req.authSession);}
 @Get('repairs/:id') repairProgress(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.repairs.get(req.user,id);}
 @Post('repairs/:id/cancel') cancelRepair(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.repairs.control(req.user,id,body,req.authSession,'cancel');}
 @Post('repairs/:id/retry') retryRepair(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.repairs.control(req.user,id,body,req.authSession,'retry');}
 @Get('limits') limits():PaperCaptureLimits{return{mediaTypes:['image/png','image/jpeg'],imageBytes:12*1024*1024,imagePixels:20_000_000,imageDimension:6000,chunkBytes:1024*1024,groupPages:120,groupOriginalBytes:50*1024*1024,wholePageImages:1,singleQuestionImages:4,derivedPdfPixels:80_000_000,derivedPdfBytes:80*1024*1024};}
 @Get('commands/:requestKey') result(@Req()req:AuthenticatedRequest,@Param('requestKey')key:string){return this.commands.result(req.user,key);}
 @Get('uploads') list(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.uploads.list(req.user,query);}
 @Post('uploads') start(@Req()req:AuthenticatedRequest,@Body()body:unknown){return this.uploads.start(req.user,body,req.authSession);}
 @Get('uploads/:id') get(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.get(req.user,id);}
 @Get('uploads/:id/commands') uploadCommands(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.originalCommands(req.user,id);}
 @Put('uploads/:id/chunks/:index') chunk(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('index')index:string,@Body()body:unknown){if(!/^\d+$/.test(index))throw new BadRequestException('原图分块序号无效。');return this.uploads.chunk(req.user,id,Number(index),body);}
 @Post('uploads/:id/complete') complete(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.uploads.complete(req.user,id,body);}
 @Post('uploads/:id/cancel') cancel(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.uploads.cancel(req.user,id,body);}
 @Get('pages/:id') page(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.uploads.pageView(req.user,id);}
 @Get('pages/:id/files') pageFiles(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Query()query:unknown){return this.integrity.page(req.user,id,query,req.authSession);}
 @Post('pages/:id/revisions') revise(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.pages.revise(req.user,id,body,req.authSession);}
 @Get('groups') listGroups(@Req()req:AuthenticatedRequest,@Query()query:unknown){return this.groups.list(req.user,query);}
 @Get('groups/:id') group(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.groups.get(req.user,id);}
 @Post('groups/:id/revisions') reviseGroup(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.groups.revise(req.user,id,body,req.authSession);}
 @Post('groups/:id/recognize') recognize(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.derivations.recognize(req.user,id,body,req.authSession);}
 @Get('groups/:id/derivations') derivationList(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.derivations.list(req.user,id);}
 @Get('derivations/:id') derivation(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.derivations.get(req.user,id);}
 @Get('derivations/:id/files') derivationFiles(@Req()req:AuthenticatedRequest,@Param('id')id:string){return this.integrity.derivation(req.user,id,req.authSession);}
 @Post('derivations/:id/cancel') cancelDerivation(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.derivations.control(req.user,id,body,req.authSession,'cancelDerivation');}
 @Post('derivations/:id/retry') retryDerivation(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Body()body:unknown){return this.derivations.control(req.user,id,body,req.authSession,'retryDerivation');}
 @Get('derivations/:id/pdf') async derivedPdf(@Req()req:AuthenticatedRequest,@Param('id')id:string){return new StreamableFile(await this.derivations.pdf(req.user,id),{type:'application/pdf',disposition:'inline'});}
 @Get('pages/:id/images/:role') async image(@Req()req:AuthenticatedRequest,@Param('id')id:string,@Param('role')role:string,@Query('version')version:string){if(!['original','baseline','derived'].includes(role))throw new BadRequestException('请选择原图或已有处理图。');const image=await this.uploads.image(req.user,id,version,role as 'original'|'baseline'|'derived');return new StreamableFile(image.bytes,{type:image.mediaType,disposition:'inline'});}
}
