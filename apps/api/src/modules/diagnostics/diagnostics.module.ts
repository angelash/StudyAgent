import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { AiModule } from '../ai/ai.module';
import { CurriculumService } from './curriculum.service';
import { DiagnosticsService } from './diagnostics.service';
import { GuidanceService } from './guidance.service';
import { DiagnosticsController } from './diagnostics.controller';
import { FoundationSeedService } from './foundation-seed.service';

@Module({ imports: [StudentsModule, QuestionWorkspaceModule, AiModule], controllers: [DiagnosticsController],
  providers: [CurriculumService, DiagnosticsService, GuidanceService, FoundationSeedService], exports: [CurriculumService, DiagnosticsService, GuidanceService] })
export class DiagnosticsModule {}
