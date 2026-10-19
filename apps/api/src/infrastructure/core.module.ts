import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { DomainEventBusService } from './domain-event-bus.service';
import { InMemoryStoreService } from './in-memory-store.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [InMemoryStoreService, DomainEventBusService, AuthGuard],
  exports: [InMemoryStoreService, DomainEventBusService, AuthGuard],
})
export class CoreModule {}
