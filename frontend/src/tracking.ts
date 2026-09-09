// Clickstream session management.
//
// The client generates a session id (UUID) per browser session (kept in
// sessionStorage) and sends it with every event so the backend can build
// ordered funnels per session.

import { api } from "./api";

export function getSessionId(): string {
  let id = sessionStorage.getItem("sessionId");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("sessionId", id);
    // SESSION_START is best-effort; the backend stores metadata-only sessions
    // for anonymous users.
    api.track("SESSION_START").catch(() => undefined);
  }
  return id;
}

export function endSession() {
  const id = sessionStorage.getItem("sessionId");
  if (id) api.track("SESSION_END").catch(() => undefined);
}

export function trackPageView(path: string) {
  api.track("PAGE_VIEW", { metadata: { path } }).catch(() => undefined);
}
