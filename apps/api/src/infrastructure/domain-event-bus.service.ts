import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DomainEventEnvelope } from '@study-agent/contracts';
import { InMemoryStoreService } from './in-memory-store.service';

@Injectable()
export class DomainEventBusService {
  constructor(private readonly store: InMemoryStoreService) {}

  publish<T>(eventName: string, payload: T): DomainEventEnvelope<T> {
    const envelope: DomainEventEnvelope<T> = {
      eventName,
      eventVersion: 1,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload,
    };

    this.store.events.push(envelope as Record<string, unknown>);
    return envelope;
  }

  all() {
    return this.store.events;
  }
}

