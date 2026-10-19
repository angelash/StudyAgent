import { Module } from '@nestjs/common';
import { ProcessingFilesModule } from './processing-files.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { ProcessingController } from './processing.controller';
import { ProcessingWorkerService } from './processing-worker.service';
@Module({ imports: [ProcessingFilesModule, QuestionWorkspaceModule], controllers: [ProcessingController], providers: [ProcessingWorkerService], exports: [ProcessingWorkerService] })
export class ProcessingModule {}
