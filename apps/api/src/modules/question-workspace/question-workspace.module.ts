import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { QuestionWorkspaceController } from './question-workspace.controller';
import { QuestionWorkspaceService } from './question-workspace.service';
import { QuestionImportService } from './question-import.service';

@Module({
  imports: [AiModule],
  controllers: [QuestionWorkspaceController],
  providers: [QuestionWorkspaceService, QuestionImportService],
  exports: [QuestionWorkspaceService, QuestionImportService],
})
export class QuestionWorkspaceModule {}
