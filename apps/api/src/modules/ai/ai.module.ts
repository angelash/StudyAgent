import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { StudentsModule } from '../students/students.module';
import { SpeechService } from './speech.service';

@Module({
  imports: [StudentsModule],
  controllers: [AiController],
  providers: [AiService, SpeechService],
  exports: [AiService, SpeechService],
})
export class AiModule {}
