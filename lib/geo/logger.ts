/**
 * Minimal server-side logger. Keeps error detail on the server only — the API
 * layer is responsible for never forwarding these messages to the client.
 * Swap the body for your logging/observability stack (Sentry, Logtail, …).
 */
export function logError(scope: string, error: unknown): void {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // eslint-disable-next-line no-console
  console.error(`[geo:${scope}] ${detail}`);
}

export function logInfo(scope: string, message: string): void {
  // eslint-disable-next-line no-console
  console.info(`[geo:${scope}] ${message}`);
}
