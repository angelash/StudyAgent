import type { InMemoryAuthSession, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { PreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import type { TopicWhiteboardAuthorization } from './topic-whiteboard-record';

/** Required at every source-derived read/write boundary; an absent adapter must fail closed. */
export interface TopicWhiteboardSourceAccess {
  capture(user: InMemoryUserAccount, prepared: PreparedAssistantWhiteboard, session: InMemoryAuthSession): TopicWhiteboardAuthorization;
  assertCurrent(user: InMemoryUserAccount, prepared: PreparedAssistantWhiteboard): void;
}
