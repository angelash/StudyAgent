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

@Module({ imports: [StudentsModule, QuestionWorkspaceModule, AiModule, StudentMediaModule, ProcessingFilesModule], controllers: [DiagnosticsController],
  providers: [CurriculumService, CurriculumPackageService, DiagnosticsService, GuidanceService, FoundationSeedService, TextbookRegistryService], exports: [CurriculumService, DiagnosticsService, GuidanceService] })
export class DiagnosticsModule {}
