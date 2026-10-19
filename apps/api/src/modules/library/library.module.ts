import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { MeasurementContentService } from './measurement-content.service';
import { MeasurementContentController } from './measurement-content.controller';
@Module({ imports: [DiagnosticsModule], controllers: [LibraryController, MeasurementContentController],
  providers: [LibraryRepository, LibraryService, MeasurementContentService], exports: [LibraryRepository, LibraryService, MeasurementContentService] })
export class LibraryModule {}
