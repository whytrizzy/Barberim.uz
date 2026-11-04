import { z } from 'zod';
import { bookingSchema } from '@/features/booking/schemas';

const block = z.object({ startMin: z.number(), endMin: z.number() });

export const calendarBookingSchema = bookingSchema.extend({
  client: z.object({ name: z.string(), phone: z.string().nullable() }),
});
export type CalendarBookingDto = z.infer<typeof calendarBookingSchema>;

/** GET /api/shops/:id/calendar?date=2026-11-03 */
export const calendarDaySchema = z.object({
  date: z.string(),
  masters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Working hours of this date; empty when not working. */
      windows: z.array(block),
      bookings: z.array(calendarBookingSchema),
    }),
  ),
});
export type CalendarDayDto = z.infer<typeof calendarDaySchema>;
export type CalendarMasterDto = CalendarDayDto['masters'][number];

/** GET /api/shops/:id/bookings/:bookingId */
export const bookingDetailSchema = calendarBookingSchema.extend({
  masterName: z.string(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    visitCount: z.number(),
    /** The shop has blacklisted them. */
    isBlocked: z.boolean(),
    noShowCount: z.number(),
    /** Has Telegram behind their record, so messages reach them. */
    canMessage: z.boolean(),
  }),
  cancelReason: z.string().nullable(),
});
export type BookingDetailDto = z.infer<typeof bookingDetailSchema>;
