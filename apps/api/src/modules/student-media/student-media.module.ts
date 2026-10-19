import { MiddlewareConsumer, Module, NestModule, PayloadTooLargeException, RequestMethod } from '@nestjs/common';
import { raw, Request, Response, NextFunction } from 'express';
import { StudentsModule } from '../students/students.module';
import { StudentMediaService, STUDENT_MEDIA_CHUNK_SIZE } from './student-media.service';
import { StudentMediaController } from './student-media.controller';
import { StudentMediaCleanupService } from './student-media-cleanup.service';

@Module({ imports: [StudentsModule], providers: [StudentMediaService, StudentMediaCleanupService], controllers: [StudentMediaController], exports: [StudentMediaService] })
export class StudentMediaModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const parser = raw({ type: 'application/octet-stream', limit: STUDENT_MEDIA_CHUNK_SIZE });
    consumer.apply((req: Request, res: Response, next: NextFunction) => parser(req, res, error => next(error?.status === 413 ? new PayloadTooLargeException('请按1MB以内分块续传附件') : error)))
      .forRoutes({ path: 'learning/media/:id/chunks/:index', method: RequestMethod.PUT });
  }
}
