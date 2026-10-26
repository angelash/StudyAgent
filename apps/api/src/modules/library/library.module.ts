import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { MeasurementContentService } from './measurement-content.service';
import { MeasurementContentController } from './measurement-content.controller';
import { StudentsModule } from '../students/students.module';
import { PaperPracticeController } from './paper-practice.controller';
import { PaperPracticeService } from './paper-practice.service';
@Module({ imports: [DiagnosticsModule, StudentsModule], controllers: [LibraryController, MeasurementContentController, PaperPracticeController],
  providers: [LibraryRepository, LibraryService, MeasurementContentService, PaperPracticeService], exports: [LibraryRepository, LibraryService, MeasurementContentService] })
export class LibraryModule {}
