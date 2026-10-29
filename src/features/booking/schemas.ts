import { z } from 'zod';

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });

/** POST /api/bookings — a client books for themselves. */
export const createBookingRequestSchema = z.object({
  staffId: id,
  /** In the order chosen; at least one, no duplicates. */
  serviceIds: z
    .array(id)
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate service'),
  startAt: instant,
  note: z.string().trim().max(500).optional(),
});
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;

/** PATCH /api/bookings/:id — one action, as the client who booked or as shop staff. */
export const bookingActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancel'),
    as: z.enum(['client', 'staff']),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal('reschedule'), as: z.enum(['client', 'staff']), startAt: instant }),
  z.object({ action: z.literal('confirm'), as: z.literal('staff') }),
  z.object({ action: z.literal('complete'), as: z.literal('staff') }),
  z.object({ action: z.literal('no_show'), as: z.literal('staff') }),
]);
export type BookingActionRequest = z.infer<typeof bookingActionRequestSchema>;

export const bookingStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED_CLIENT',
  'CANCELLED_SHOP',
]);

export const bookingSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  staffId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  status: bookingStatusSchema,
  source: z.enum(['APP', 'WALK_IN', 'PHONE']),
  totalPrice: z.number().int(),
  note: z.string().nullable(),
  items: z.array(
    z.object({ name: z.string(), price: z.number().int(), durationMin: z.number().int() }),
  ),
});
export type BookingDto = z.infer<typeof bookingSchema>;

/**
 * `details.reason` on a refused booking (status 409 conflict / 400 invalid_input / 403):
 * the client shows a specific message for each.
 */
export type BookingRefusal =
  | 'slot_taken' // someone else just took it (or the database caught an overlap)
  | 'slot_unavailable' // outside hours, too soon, day off… (see details.slot)
  | 'service_unavailable' // a service isn't offered by this master
  | 'phone_required'
  | 'client_blocked'
  | 'too_many_bookings'
  | 'transition_refused'; // see details.transition
