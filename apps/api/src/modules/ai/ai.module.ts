import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CodexSearchService } from './codex-search.service';

@Module({
  controllers: [AiController],
  providers: [AiService, CodexSearchService],
  exports: [AiService],
})
export class AiModule {}
