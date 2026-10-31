import { z } from 'zod';
import { blocksAreValid, MAX_DAY_BLOCKS } from '@/domain/schedule';
import { parseDateKey } from '@/domain/time';

/** A vacation or a whole Ramadan, not a whole year by accident. */
export const MAX_CHANGE_DAYS = 90;

const minute = z.number().int().min(0).max(1440).multipleOf(5);
const block = z.object({ startMin: minute, endMin: minute });
const dayKey = z.string().refine((value) => parseDateKey(value) !== null, 'bad date');

export const CHANGE_REASONS = ['vacation', 'ramadan', 'leave_early', 'other'] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];

/** PUT /api/shops/:id/staff/:staffId/schedule — the whole weekly schedule at once. */
export const weeklyRequestSchema = z.object({
  weekly: z
    .array(block.extend({ weekday: z.number().int().min(1).max(7) }))
    .max(7 * MAX_DAY_BLOCKS)
    .refine(
      (blocks) =>
        [1, 2, 3, 4, 5, 6, 7].every((weekday) =>
          blocksAreValid(
            blocks.filter((b) => b.weekday === weekday).sort((a, b) => a.startMin - b.startMin),
          ),
        ),
      'overlapping hours',
    ),
});
export type WeeklyRequest = z.infer<typeof weeklyRequestSchema>;

/** POST /api/shops/:id/staff/:staffId/schedule/changes */
export const changeRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('day_off'),
    from: dayKey,
    to: dayKey,
    reason: z.enum(CHANGE_REASONS),
  }),
  z.object({
    kind: z.literal('custom_hours'),
    from: dayKey,
    to: dayKey,
    reason: z.enum(CHANGE_REASONS),
    blocks: z.array(block).min(1).max(MAX_DAY_BLOCKS).refine(blocksAreValid, 'overlapping hours'),
  }),
  /** "Today I leave at 16:00": the day's own hours, cut short. */
  z.object({ kind: z.literal('leave_at'), date: dayKey, leaveAt: minute }),
]);
export type ChangeRequest = z.infer<typeof changeRequestSchema>;

/** DELETE /api/shops/:id/staff/:staffId/schedule/changes?from=…&to=… */
export const removeChangeQuerySchema = z.object({ from: dayKey, to: dayKey });

export const scheduleSchema = z.object({
  staffId: z.string(),
  name: z.string(),
  canEdit: z.boolean(),
  weekly: z.array(block.extend({ weekday: z.number() })),
  /** Today, or a later date's changes: past days are history and aren't listed. */
  changes: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(['DAY_OFF', 'CUSTOM_HOURS']),
      reason: z.enum(CHANGE_REASONS).nullable(),
      blocks: z.array(block),
    }),
  ),
  today: z.object({ date: z.string(), blocks: z.array(block) }),
  /** Upcoming bookings these hours no longer cover. They stay until someone moves them. */
  bookingsOutsideHours: z.number(),
});
export type ScheduleDto = z.infer<typeof scheduleSchema>;
export type ScheduleChange = ScheduleDto['changes'][number];

/** `details.reason` when a schedule change is refused. */
export type ScheduleRefusal = 'bad_dates' | 'not_working_today';
