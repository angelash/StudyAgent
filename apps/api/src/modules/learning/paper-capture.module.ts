import {MiddlewareConsumer,Module,NestModule,PayloadTooLargeException,RequestMethod} from '@nestjs/common';
import {raw,type RequestHandler} from 'express';
import {StudentsModule} from '../students/students.module';
import {PaperCaptureController} from './paper-capture.controller';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureFileService} from './paper-capture-file.service';
import {PaperCaptureUploadService} from './paper-capture-upload.service';
import {PAPER_IMAGE_CHUNK_BYTES} from './paper-capture-record';
import {PaperCaptureCleanupWorkerService} from './paper-capture-cleanup-worker.service';
import {PaperCapturePageService} from './paper-capture-page.service';
import {PaperCaptureGroupService} from './paper-capture-group.service';
import {PaperCaptureDerivationService} from './paper-capture-derivation.service';
import {PaperCaptureDerivationWorkerService} from './paper-capture-derivation-worker.service';
import {StudioMaterialMaintenanceModule} from './studio-material-maintenance.module';
import {PaperCaptureIntegrityService} from './paper-capture-integrity.service';
import {PaperCaptureRepairService} from './paper-capture-repair.service';
import {PaperCaptureRepairWorkerService} from './paper-capture-repair-worker.service';
@Module({imports:[StudentsModule,StudioMaterialMaintenanceModule],controllers:[PaperCaptureController],providers:[PaperCaptureCommandService,PaperCaptureFileService,PaperCaptureUploadService,PaperCaptureCleanupWorkerService,PaperCapturePageService,PaperCaptureGroupService,PaperCaptureDerivationService,PaperCaptureDerivationWorkerService,PaperCaptureIntegrityService,PaperCaptureRepairService,PaperCaptureRepairWorkerService],exports:[PaperCaptureCommandService,PaperCaptureFileService,PaperCaptureUploadService]})
export class PaperCaptureModule implements NestModule{
 configure(consumer:MiddlewareConsumer){const parser=raw({type:'application/octet-stream',limit:PAPER_IMAGE_CHUNK_BYTES});const bounded:RequestHandler=(req,res,next)=>parser(req,res,error=>error?next(new PayloadTooLargeException('每个原件分块最多1MiB，请保留文件后按原分块继续。')):next());consumer.apply(bounded).forRoutes({path:'learning/paper-captures/uploads/:id/chunks/:index',method:RequestMethod.PUT},{path:'learning/paper-captures/repair-uploads/:id/chunks/:index',method:RequestMethod.PUT});}
}
