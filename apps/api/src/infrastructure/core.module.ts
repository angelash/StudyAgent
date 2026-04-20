import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { DomainEventBusService } from './domain-event-bus.service';
import { InMemoryStoreService } from './in-memory-store.service';

@Global()
@Module({
  providers: [InMemoryStoreService, DomainEventBusService, AuthGuard],
  exports: [InMemoryStoreService, DomainEventBusService, AuthGuard],
})
export class CoreModule {}

