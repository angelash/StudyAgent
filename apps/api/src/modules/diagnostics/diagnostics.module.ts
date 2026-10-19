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

@Module({ imports: [StudentsModule, QuestionWorkspaceModule, AiModule, StudentMediaModule], controllers: [DiagnosticsController],
  providers: [CurriculumService, DiagnosticsService, GuidanceService, FoundationSeedService, TextbookRegistryService], exports: [CurriculumService, DiagnosticsService, GuidanceService] })
export class DiagnosticsModule {}
