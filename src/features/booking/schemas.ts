import { z } from 'zod';
import { CLIENT_LATE_OPTIONS, SHOP_DELAY_OPTIONS } from '@/domain/notices';
import { bookingDepositSchema } from '@/features/deposits/schemas';
import { MAX_PACKAGE_PEOPLE } from '@/features/services/schemas';

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });

/** In the order chosen; at least one, no duplicates. */
const serviceIds = z
  .array(id)
  .min(1)
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'duplicate service');

/** A specific master, or "any" free master of the shop (then `shopId` is required). */
const master = {
  staffId: z.union([id, z.literal('any')]),
  shopId: id.optional(),
};
const anyNeedsShop = (b: { staffId: string; shopId?: string }) => b.staffId !== 'any' || !!b.shopId;

/** POST /api/bookings — a client books for themselves. */
export const createBookingRequestSchema = z
  .object({
    ...master,
    serviceIds,
    startAt: instant,
    note: z.string().trim().max(500).optional(),
    /** A wedding package: how many people it's for (up to what the package covers). */
    peopleCount: z.number().int().min(1).max(MAX_PACKAGE_PEOPLE).optional(),
  })
  .refine(anyNeedsShop, { path: ['shopId'], message: 'shopId is required for any master' });
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;

/** POST /api/bookings/group — a family (2–5 people) back to back with one master. */
export const createGroupBookingRequestSchema = z
  .object({
    ...master,
    startAt: instant,
    note: z.string().trim().max(500).optional(),
    parties: z
      .array(z.object({ serviceIds, label: z.string().trim().max(60).optional() }))
      .min(2)
      .max(5),
  })
  .refine(anyNeedsShop, { path: ['shopId'], message: 'shopId is required for any master' });
export type CreateGroupBookingRequest = z.infer<typeof createGroupBookingRequestSchema>;

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
  groupId: z.string().nullable(),
  totalPrice: z.number().int(),
  note: z.string().nullable(),
  /** The client tapped "Coming" on a reminder for this time. */
  clientConfirmed: z.boolean(),
  /** The client said they're running this many minutes late. */
  clientLateMin: z.number().int().nullable(),
  /** A wedding package: how many people, and the prepayment the shop waits for. */
  peopleCount: z.number().int().nullable(),
  depositAmount: z.number().int().nullable(),
  /** An online deposit (P3.1), when one was asked for. */
  deposit: bookingDepositSchema.nullable(),
  /** The shop said the master is running this many minutes late. */
  shopDelayMin: z.number().int().nullable(),
  items: z.array(
    z.object({ name: z.string(), price: z.number().int(), durationMin: z.number().int() }),
  ),
});
export type BookingDto = z.infer<typeof bookingSchema>;

/** GET /api/shops/:id/availability?services=a,b&staff=any — what a client can book, by day. */
export const availabilityQuerySchema = z.object({
  staff: z.union([id, z.literal('any')]),
  services: serviceIds,
  /** "2026-11-03": two weeks from this day instead of today (a wedding planned ahead). */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const bookingOptionsSchema = z.object({
  days: z.array(
    z.object({
      /** "2026-11-03" in Tashkent. */
      date: z.string(),
      status: z.enum(['open', 'full', 'closed', 'day_off', 'past', 'beyond_horizon']),
      /** Only the starts that can actually be taken. */
      slots: z.array(z.object({ startMin: z.number(), startAt: z.string() })),
    }),
  ),
});
export type BookingOptions = z.infer<typeof bookingOptionsSchema>;

/** GET /api/me/bookings/:id — a client's own booking, with where to go. */
export const myBookingSchema = bookingSchema.extend({
  masterName: z.string(),
  /** The services, for booking the same again (ones the shop has since removed are left out). */
  serviceIds: z.array(z.string()),
  shop: z.object({
    slug: z.string(),
    name: z.string(),
    address: z.string(),
    landmark: z.string().nullable(),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  }),
});
export type MyBookingDto = z.infer<typeof myBookingSchema>;

/** GET /api/me/bookings */
export const myBookingsSchema = z.object({
  /** Soonest first. */
  upcoming: z.array(myBookingSchema),
  /** Latest first: finished, missed and cancelled. */
  past: z.array(myBookingSchema),
});
export type MyBookingsDto = z.infer<typeof myBookingsSchema>;

/** POST /api/shops/:id/bookings — staff add a walk-in or a booking taken by phone. */
export const createStaffBookingRequestSchema = z.object({
  staffId: id,
  serviceIds,
  startAt: instant,
  source: z.enum(['WALK_IN', 'PHONE']),
  client: z.union([
    z.object({ shopClientId: id }),
    z.object({
      name: z.string().trim().min(1).max(60),
      phone: z.string().trim().max(20).optional(),
    }),
  ]),
  note: z.string().trim().max(500).optional(),
});
export type CreateStaffBookingRequest = z.infer<typeof createStaffBookingRequestSchema>;

/** GET /api/shops/:id/clients?q=… */
export const clientMatchesSchema = z.object({
  clients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      visitCount: z.number(),
    }),
  ),
});
export type ClientMatch = z.infer<typeof clientMatchesSchema>['clients'][number];

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
  | 'too_many_people' // more than the wedding package covers
  | 'transition_refused'; // see details.transition

/** POST /api/bookings/:id/notice — a live notice about a visit on the day. */
export const bookingNoticeRequestSchema = z.discriminatedUnion('kind', [
  /** "Your turn is next", from the shop. */
  z.object({ kind: z.literal('next_up') }),
  /** The master is running late, from the shop. */
  z.object({ kind: z.literal('shop_delay'), minutes: z.literal(SHOP_DELAY_OPTIONS) }),
  /** The client is running late. */
  z.object({ kind: z.literal('client_late'), minutes: z.literal(CLIENT_LATE_OPTIONS) }),
]);
export type BookingNoticeRequest = z.infer<typeof bookingNoticeRequestSchema>;

/** `details.reason` when a notice is refused. */
export type NoticeRefusal = 'not_now' | 'too_many_notices';
