import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { StudentsModule } from '../students/students.module';
import { ContentModule } from '../content/content.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';

@Module({
  imports: [StudentsModule, ContentModule, DiagnosticsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
