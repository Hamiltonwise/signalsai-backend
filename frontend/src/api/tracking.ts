/**
 * Behavioral event tracking for the Checkup flow.
 * Fire-and-forget — never blocks UI.
 * No PII. No patient data.
 */

let _sessionId: string | null = null;

/** Get or create a session ID for this browser session */
export function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = crypto.randomUUID();
  }
  return _sessionId;
}

/** Track a behavioral event */
export function trackEvent(
  eventType: string,
  properties: Record<string, unknown> = {}
): void {
  fetch("/api/checkup/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      sessionId: getSessionId(),
      properties,
    }),
  }).catch(() => {});
}
