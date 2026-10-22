import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { StudentsModule } from '../students/students.module';
import { SpeechService } from './speech.service';
import { CodexPdfStructureService } from './codex-pdf-structure.service';
import { XiaojiuModelsService } from './xiaojiu-models.service';
import { XiaojiuChatService } from './xiaojiu-chat.service';

@Module({
  imports: [StudentsModule],
  controllers: [AiController],
  providers: [AiService, SpeechService, CodexPdfStructureService, XiaojiuModelsService, XiaojiuChatService],
  exports: [AiService, SpeechService, CodexPdfStructureService, XiaojiuModelsService, XiaojiuChatService],
})
export class AiModule {}
