import { RetentionService } from './retention.service';
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
import { ControlledEditorialService } from './controlled-editorial.service';
import { ControlledEditorialController } from './controlled-editorial.controller';
import { ControlledDiagnosticsService } from './controlled-diagnostics.service';
import { ControlledDiagnosticsController } from './controlled-diagnostics.controller';
import { TextbookTeachingService } from './textbook-teaching.service';
import { TextbookTeachingController } from './textbook-teaching.controller';

@Module({ imports: [StudentsModule, QuestionWorkspaceModule, AiModule, StudentMediaModule, ProcessingFilesModule], controllers: [DiagnosticsController,GuidanceModelController,ControlledEditorialController,ControlledDiagnosticsController,TextbookTeachingController],
  providers: [TextbookTeachingService,ControlledEditorialService,ControlledDiagnosticsService,RetentionService,CurriculumService, CurriculumPackageService, DiagnosticsService, GuidanceService, FoundationSeedService, TextbookRegistryService,
    GuidanceModelService,GuidanceModelWorkerService,{provide:guidanceModelPort,useExisting:GuidanceModelService}], exports: [TextbookRegistryService,RetentionService,CurriculumService, DiagnosticsService, GuidanceService] })
export class DiagnosticsModule {}
