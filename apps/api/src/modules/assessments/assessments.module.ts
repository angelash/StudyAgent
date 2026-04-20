import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { ContentModule } from '../content/content.module';
import { StudentsModule } from '../students/students.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ContentModule, StudentsModule, AiModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}

