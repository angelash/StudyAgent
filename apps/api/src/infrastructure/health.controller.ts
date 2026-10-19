import { Controller, Get } from '@nestjs/common';
import { InMemoryStoreService } from './in-memory-store.service';

@Controller()
export class HealthController {
  constructor(private readonly store: InMemoryStoreService) {}
  @Get('health') health() { return { status: 'ok', service: 'study-agent', version: '0.2.0' }; }
  @Get('ready') ready() { return { status: 'ready', storage: this.store.persistence }; }
}
