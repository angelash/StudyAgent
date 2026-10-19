import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { RetiredLearningController } from './retired-learning.controller';
@Module({ imports: [StudentsModule, DiagnosticsModule, QuestionWorkspaceModule], controllers: [LearningController, RetiredLearningController], providers: [LearningService], exports: [LearningService] })
export class LearningModule {}
