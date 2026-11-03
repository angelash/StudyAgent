import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LearningModule } from '../learning/learning.module';
import { LibraryModule } from '../library/library.module';
import { OperationsCapabilitiesController, OperationsCapabilitiesService } from './operations-capabilities.service';

@Module({ imports: [AiModule, LearningModule, LibraryModule], controllers: [OperationsCapabilitiesController],
  providers: [OperationsCapabilitiesService] })
export class OperationsCapabilitiesModule {}
