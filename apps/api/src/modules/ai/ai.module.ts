import { TeachingToolService } from './teaching-tool.service';
import { TeachingToolCompatibilityService } from './teaching-tool-compatibility.service';
import { TeachingToolWorkerService } from './teaching-tool-worker.service';
import { TeachingToolController } from './teaching-tool.controller';
import { teachingToolWorkerPort } from './teaching-tool-record';
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { StudentsModule } from '../students/students.module';
import { SpeechService } from './speech.service';
import { CodexPdfStructureService } from './codex-pdf-structure.service';
import { XiaojiuModelsService } from './xiaojiu-models.service';
import { XiaojiuChatService } from './xiaojiu-chat.service';
import { AssistantTurnService } from './assistant-turn.service';
import { AssistantTurnWorkerService } from './assistant-turn-worker.service';
import { AssistantTurnController } from './assistant-turn.controller';
import { assistantTurnPort, assistantWorkerPort } from './assistant-turn-record';

@Module({
  imports: [StudentsModule],
  controllers: [AiController,AssistantTurnController,TeachingToolController],
  providers: [TeachingToolCompatibilityService,TeachingToolService,TeachingToolWorkerService,{provide:teachingToolWorkerPort,useExisting:TeachingToolWorkerService},AiService, SpeechService, CodexPdfStructureService, XiaojiuModelsService, XiaojiuChatService,AssistantTurnService,AssistantTurnWorkerService,
    {provide:assistantTurnPort,useExisting:AssistantTurnService},{provide:assistantWorkerPort,useExisting:AssistantTurnWorkerService}],
  exports: [AiService, SpeechService, CodexPdfStructureService, XiaojiuModelsService, XiaojiuChatService],
})
export class AiModule {}
