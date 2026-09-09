/**
 * Clickstream / event tracking service.
 *
 * Every user interaction flows through here and is persisted to the
 * AnalyticsEvent table. All analytics (dashboards, funnels, KPIs) are
 * computed from these stored events — nothing is hard-coded.
 *
 * Sessions: the client generates a session id (UUID in localStorage) and
 * sends it with events. To keep referential integrity we upsert a Session
 * row on first sight of that id; events without a valid user fall back to
 * an anonymous session row owned by no one (userId nullable on Session is
 * not allowed, so we require userId — events without a user keep sessionId
 * stored as metadata only, or null).
 */

import { prisma } from "../lib/prisma.js";
import type { EventType } from "@prisma/client";

export interface TrackEventInput {
  userId?: string | null;
  sessionId?: string | null;
  eventType: EventType;
  jobId?: string | null;
  searchQuery?: string | null;
  metadata?: Record<string, unknown>;
}

/** Ensure a Session row exists for the given id; returns the id or null. */
async function ensureSession(sessionId: string | null | undefined, userId: string | null) {
  if (!sessionId) return null;
  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (existing) return existing.id;
  if (!userId) return null; // anonymous sessions cannot be created without a user
  try {
    await prisma.session.create({ data: { id: sessionId, userId } });
    return sessionId;
  } catch {
    // Raced with another request creating the same session.
    const created = await prisma.session.findUnique({ where: { id: sessionId } });
    return created?.id ?? null;
  }
}

export async function trackEvent(input: TrackEventInput) {
  const sessionId = await ensureSession(input.sessionId, input.userId ?? null);
  const event = await prisma.analyticsEvent.create({
    data: {
      userId: input.userId ?? null,
      sessionId,
      eventType: input.eventType,
      jobId: input.jobId ?? null,
      searchQuery: input.searchQuery ?? null,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
  return event;
}

export async function trackEvents(inputs: TrackEventInput[]) {
  const created: string[] = [];
  for (const input of inputs) {
    const event = await trackEvent(input);
    created.push(event.id);
  }
  return created;
}

/** Close a session: set endedAt if not already set. */
export async function endSession(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.endedAt) return session;
  return prisma.session.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });
}
