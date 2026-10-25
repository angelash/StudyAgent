import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { AiModule } from '../ai/ai.module';
import { CurriculumService } from './curriculum.service';
import { DiagnosticsService } from './diagnostics.service';
import { GuidanceService } from './guidance.service';
import { DiagnosticsController } from './diagnostics.controller';
import { FoundationSeedService } from './foundation-seed.service';
import { TextbookRegistryService } from './textbook-registry.service';
import { StudentMediaModule } from '../student-media/student-media.module';
import { ProcessingFilesModule } from '../processing/processing-files.module';
import { CurriculumPackageService } from './curriculum-package.service';
import { GuidanceModelService } from './guidance-model.service';
import { GuidanceModelWorkerService } from './guidance-model-worker.service';
import { GuidanceModelController } from './guidance-model.controller';
import { guidanceModelPort } from './guidance-model-record';

@Module({ imports: [StudentsModule, QuestionWorkspaceModule, AiModule, StudentMediaModule, ProcessingFilesModule], controllers: [DiagnosticsController,GuidanceModelController],
  providers: [CurriculumService, CurriculumPackageService, DiagnosticsService, GuidanceService, FoundationSeedService, TextbookRegistryService,
    GuidanceModelService,GuidanceModelWorkerService,{provide:guidanceModelPort,useExisting:GuidanceModelService}], exports: [CurriculumService, DiagnosticsService, GuidanceService] })
export class DiagnosticsModule {}
