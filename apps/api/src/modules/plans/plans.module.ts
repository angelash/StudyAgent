import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { StudentsModule } from '../students/students.module';
import { ContentModule } from '../content/content.module';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [StudentsModule, ContentModule, AssessmentsModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
