import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { StudentsModule } from '../students/students.module';
import { SpeechService } from './speech.service';
import { CodexPdfStructureService } from './codex-pdf-structure.service';

@Module({
  imports: [StudentsModule],
  controllers: [AiController],
  providers: [AiService, SpeechService, CodexPdfStructureService],
  exports: [AiService, SpeechService, CodexPdfStructureService],
})
export class AiModule {}
