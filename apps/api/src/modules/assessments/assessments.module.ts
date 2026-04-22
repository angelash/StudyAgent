import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { ContentModule } from '../content/content.module';
import { StudentsModule } from '../students/students.module';
import { AiModule } from '../ai/ai.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';

@Module({
  imports: [ContentModule, StudentsModule, AiModule, QuestionWorkspaceModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
