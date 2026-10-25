import { MiddlewareConsumer, Module, NestModule, PayloadTooLargeException, RequestMethod } from '@nestjs/common';
import { raw, type Request, type Response, type NextFunction } from 'express';
import { projectAssetLimits } from '@study-agent/contracts';
import { StudentsModule } from '../students/students.module';
import { ProjectFileService } from './project-file.service';
import { ProjectFileController } from './project-file.controller';
import { ProjectFileWorkerService } from './project-file-worker.service';

@Module({imports:[StudentsModule],controllers:[ProjectFileController],providers:[ProjectFileService,ProjectFileWorkerService],exports:[ProjectFileService]})
export class ProjectFileModule implements NestModule {
  configure(consumer:MiddlewareConsumer){const parser=raw({type:'application/octet-stream',limit:projectAssetLimits.chunkBytes});
    consumer.apply((req:Request,res:Response,next:NextFunction)=>parser(req,res,error=>next(error?.status===413?new PayloadTooLargeException('请按1MiB以内分块上传项目附件'):error))).forRoutes({path:'learning/project-files/uploads/:id/chunks/:index',method:RequestMethod.PUT});
  }
}
