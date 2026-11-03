import { z } from 'zod';

/** Days someone is waiting for at once, across all shops. */
export const MAX_WAITLIST_ENTRIES = 5;

const id = z.uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** POST /api/me/waitlist — "tell me if a time frees up that day". Joining again updates it. */
export const joinWaitlistRequestSchema = z.object({
  shopId: id,
  /** Null: any master who does the services. */
  staffId: id.nullable(),
  serviceIds: z
    .array(id)
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate service'),
  date: dateKey,
});
export type JoinWaitlistRequest = z.infer<typeof joinWaitlistRequestSchema>;

export const waitlistEntrySchema = z.object({
  id: z.string(),
  shopId: z.string(),
  shopSlug: z.string(),
  shopName: z.string(),
  date: z.string(),
  staffId: z.string().nullable(),
  /** Null when any master will do. */
  masterName: z.string().nullable(),
  serviceIds: z.array(z.string()),
  serviceNames: z.array(z.string()),
});
export type WaitlistEntryDto = z.infer<typeof waitlistEntrySchema>;

/** GET /api/me/waitlist — the days the person is still waiting for, soonest first. */
export const waitlistSchema = z.object({ entries: z.array(waitlistEntrySchema) });
export type WaitlistDto = z.infer<typeof waitlistSchema>;

export const leftWaitlistSchema = z.object({ removed: z.literal(true) });

/** `details.reason` when joining is refused. */
export type WaitlistRefusal = 'too_many_entries' | 'outside_booking_window';
