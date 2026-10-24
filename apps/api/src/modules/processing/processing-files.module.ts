import { MiddlewareConsumer, Module, NestModule, PayloadTooLargeException, RequestMethod } from '@nestjs/common';
import { raw, Request, Response, NextFunction } from 'express';
import { ImportFilesService, UPLOAD_CHUNK_SIZE } from './import-files.service';
import { ImportFilesController } from './processing.controller';
@Module({ controllers: [ImportFilesController], providers: [ImportFilesService], exports: [ImportFilesService] })
export class ProcessingFilesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const parser = raw({ type: 'application/octet-stream', limit: UPLOAD_CHUNK_SIZE });
    consumer.apply((req: Request, res: Response, next: NextFunction) => parser(req, res, error => {
      next(error?.status === 413 ? new PayloadTooLargeException('单个上传分块最多 4 MB，请按文件分块续传') : error);
    })).forRoutes({ path: 'admin/import-files/:id/chunks/:index', method: RequestMethod.PUT },{path:'learning/material-uploads/:id/chunks/:index',method:RequestMethod.PUT});
  }
}
