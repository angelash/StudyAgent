import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { LearningModule } from '../learning/learning.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
@Module({ imports: [StudentsModule, DiagnosticsModule, LearningModule], controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
