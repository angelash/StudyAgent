import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { DemoContentSeedService } from './demo-content-seed.service';
import { QuestionWorkspaceModule } from '../question-workspace/question-workspace.module';

@Module({
  imports: [QuestionWorkspaceModule],
  controllers: [ContentController],
  providers: [ContentService, DemoContentSeedService],
  exports: [ContentService],
})
export class ContentModule {}
