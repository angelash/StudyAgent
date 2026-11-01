import type { Server } from 'node:http';

/** A reverse proxy can reuse an idle upstream socket at the moment Node's 5 s default closes it;
 * the proxy then answers 500 (ECONNRESET). Keep idle API sockets open longer than the proxy's
 * own reuse window. Node requires headersTimeout to exceed keepAliveTimeout. */
export function configureProxyKeepAlive(server: Server, idleMs = 65_000) {
  server.keepAliveTimeout = idleMs;
  server.headersTimeout = idleMs + 1_000;
}
