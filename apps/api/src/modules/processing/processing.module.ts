import { Module } from '@nestjs/common';
import { ProcessingFilesModule } from './processing-files.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { ProcessingController } from './processing.controller';
import { ProcessingWorkerService } from './processing-worker.service';
import { AiModule } from '../ai/ai.module';
import { StudentsModule } from '../students/students.module';
@Module({ imports: [ProcessingFilesModule, QuestionWorkspaceModule, AiModule,StudentsModule], controllers: [ProcessingController], providers: [ProcessingWorkerService], exports: [ProcessingWorkerService] })
export class ProcessingModule {}
