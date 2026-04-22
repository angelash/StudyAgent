import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { StudentsModule } from '../students/students.module';
import { ContentModule } from '../content/content.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AiModule } from '../ai/ai.module';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';

@Module({
  imports: [StudentsModule, ContentModule, AssessmentsModule, AiModule, QuestionWorkspaceModule],
  controllers: [MissionsController],
  providers: [MissionsService],
})
export class MissionsModule {}
