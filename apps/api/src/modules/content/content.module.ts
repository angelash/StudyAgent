import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { DemoContentSeedService } from './demo-content-seed.service';
import { QuestionCoverageService } from './question-coverage.service';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';

@Module({
  imports: [QuestionWorkspaceModule],
  controllers: [ContentController],
  providers: [ContentService, DemoContentSeedService, QuestionCoverageService],
  exports: [ContentService],
})
export class ContentModule {}
