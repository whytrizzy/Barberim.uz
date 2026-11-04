import { z } from 'zod';
import { EARNINGS_PERIODS } from '@/domain/earnings';

/** GET /api/shops/:id/earnings?period=week&date=2026-11-05 */
export const earningsQuerySchema = z.object({
  period: z.enum(EARNINGS_PERIODS).default('week'),
  /** Any day in the period; today when left out. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const earningsSchema = z.object({
  period: z.enum(EARNINGS_PERIODS),
  /** "2026-11-03": the first day, and how many days. */
  from: z.string(),
  days: z.number(),
  /** A master sees only their own visits. */
  onlyMine: z.boolean(),
  revenue: z.number(),
  /** The period before, for comparison. */
  previousRevenue: z.number(),
  visits: z.number(),
  noShows: z.number(),
  cancelled: z.number(),
  expected: z.number(),
  noShowRate: z.number().nullable(),
  averageTicket: z.number().nullable(),
  series: z.array(z.object({ key: z.string(), revenue: z.number() })),
  busyHours: z.array(z.object({ hour: z.number(), bookings: z.number() })),
  byMaster: z.array(
    z.object({
      staffId: z.string(),
      name: z.string(),
      revenue: z.number(),
      visits: z.number(),
      noShows: z.number(),
    }),
  ),
  topServices: z.array(z.object({ name: z.string(), count: z.number(), revenue: z.number() })),
});
export type EarningsDto = z.infer<typeof earningsSchema>;
