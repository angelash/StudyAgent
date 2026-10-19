import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { DomainEventBusService } from './domain-event-bus.service';
import { InMemoryStoreService } from './in-memory-store.service';
import { HealthController } from './health.controller';
import { RateLimitService } from './rate-limit.service';
import { RuntimeMetricsService } from './runtime-metrics.service';
import { OperationsController } from './operations.controller';

@Global()
@Module({
  controllers: [HealthController, OperationsController],
  providers: [InMemoryStoreService, DomainEventBusService, RateLimitService, RuntimeMetricsService, AuthGuard],
  exports: [InMemoryStoreService, DomainEventBusService, RateLimitService, RuntimeMetricsService, AuthGuard],
})
export class CoreModule {}
