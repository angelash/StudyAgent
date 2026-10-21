import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { RetiredLearningController } from './retired-learning.controller';
import { StudentMediaModule } from '../student-media/student-media.module';
import { AiModule } from '../ai/ai.module';
import { NotebookService } from './notebook.service';
import { NotebookController } from './notebook.controller';
import { StudioIntegrationService } from './studio-integration.service';
@Module({ imports: [StudentsModule, DiagnosticsModule, QuestionWorkspaceModule, StudentMediaModule, AiModule], controllers: [LearningController, RetiredLearningController, NotebookController], providers: [LearningService, NotebookService, StudioIntegrationService], exports: [LearningService, StudioIntegrationService] })
export class LearningModule {}
