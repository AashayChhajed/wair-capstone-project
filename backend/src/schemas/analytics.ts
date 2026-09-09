import { z } from "zod";

export const trackEventSchema = z.object({
  eventType: z.enum([
    "PAGE_VIEW",
    "SEARCH",
    "JOB_VIEW",
    "JOB_SAVE",
    "JOB_UNSAVE",
    "APPLY_START",
    "APPLICATION_SUBMITTED",
    "RECOMMENDATION_IMPRESSION",
    "RECOMMENDATION_CLICK",
    "FILTER_USED",
    "SESSION_START",
    "SESSION_END",
  ]),
  jobId: z.string().optional().nullable(),
  searchQuery: z.string().max(300).optional().nullable(),
  sessionId: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});
