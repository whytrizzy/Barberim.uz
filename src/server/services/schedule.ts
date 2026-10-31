import 'server-only';
import { workingWindows, type DayOverride } from '@/domain/availability';
import {
  clipBlocks,
  countBookingsOutsideHours,
  groupChanges,
  type Block,
  type DayChange,
} from '@/domain/schedule';
import { canManageStaff } from '@/domain/staff';
import {
  addDays,
  dateKey,
  daysBetween,
  parseDateKey,
  tashkentDate,
  type CalendarDate,
} from '@/domain/time';
import {
  MAX_CHANGE_DAYS,
  type ChangeReason,
  type ChangeRequest,
  type ScheduleDto,
  type ScheduleRefusal,
  type WeeklyRequest,
} from '@/features/schedule/schemas';
import type { Staff, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { dbDate } from './availability';

function refuse(reason: ScheduleRefusal): never {
  throw new AppError('invalid_input', reason, { reason });
}

const canEdit = (me: Staff, member: Staff) =>
  me.id === member.id || canManageStaff(me.role, member.role);

async function access(user: User, shopId: string, staffId: string) {
  const me = await requireStaff(user.id, shopId);
  const member = await db.staff.findFirst({ where: { id: staffId, shopId, isActive: true } });
  if (!member) throw new AppError('not_found', 'no such staff member');
  return { me, member };
}

/** Masters run their own hours; owners and admins also run the hours of those they manage. */
async function editAccess(user: User, shopId: string, staffId: string) {
  const { me, member } = await access(user, shopId, staffId);
  if (!canEdit(me, member)) throw new AppError('forbidden', 'cannot edit this schedule');
  return member;
}

type OverrideRow = {
  date: Date;
  type: 'DAY_OFF' | 'CUSTOM_HOURS';
  startMin: number | null;
  endMin: number | null;
  reason: string | null;
};

const rowKey = (row: OverrideRow) => row.date.toISOString().slice(0, 10);

const rowOverride = (row: OverrideRow): DayOverride =>
  row.type === 'DAY_OFF'
    ? { type: 'DAY_OFF' }
    : { type: 'CUSTOM_HOURS', startMin: row.startMin ?? 0, endMin: row.endMin ?? 0 };

async function buildSchedule(member: Staff, editable: boolean): Promise<ScheduleDto> {
  const now = new Date();
  const today = tashkentDate(now);
  const [weekly, rows, bookings] = await Promise.all([
    db.weeklyHours.findMany({
      where: { staffId: member.id },
      select: { weekday: true, startMin: true, endMin: true },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    }),
    db.scheduleOverride.findMany({
      where: { staffId: member.id, date: { gte: dbDate(today) } },
      select: { date: true, type: true, startMin: true, endMin: true, reason: true },
      orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    }),
    db.booking.findMany({
      where: {
        staffId: member.id,
        startAt: { gt: now },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const byDate = new Map<string, OverrideRow[]>();
  for (const row of rows) byDate.set(rowKey(row), [...(byDate.get(rowKey(row)) ?? []), row]);
  const overridesFor = (date: CalendarDate) => (byDate.get(dateKey(date)) ?? []).map(rowOverride);

  const days: DayChange[] = [...byDate].map(([date, dayRows]) => ({
    date,
    type: dayRows[0]!.type,
    reason: dayRows[0]!.reason,
    blocks: dayRows.flatMap((row) =>
      row.type === 'CUSTOM_HOURS' ? [{ startMin: row.startMin ?? 0, endMin: row.endMin ?? 0 }] : [],
    ),
  }));

  return {
    staffId: member.id,
    name: member.displayName,
    canEdit: editable,
    weekly,
    changes: groupChanges(days) as ScheduleDto['changes'],
    today: { date: dateKey(today), blocks: windowsAsBlocks(today, weekly, overridesFor(today)) },
    bookingsOutsideHours: countBookingsOutsideHours(bookings, weekly, overridesFor),
  };
}

function windowsAsBlocks(
  date: CalendarDate,
  weekly: ScheduleDto['weekly'],
  overrides: DayOverride[],
): Block[] {
  const windows = workingWindows(date, weekly, overrides);
  return windows === 'day_off'
    ? []
    : windows.map((window) => ({ startMin: window.start, endMin: window.end }));
}

export async function getSchedule(user: User, shopId: string, staffId: string) {
  const { me, member } = await access(user, shopId, staffId);
  return buildSchedule(member, canEdit(me, member));
}

/** Replaces the whole weekly schedule. Bookings stay; the answer says how many no longer fit. */
export async function setWeeklyHours(
  user: User,
  shopId: string,
  staffId: string,
  input: WeeklyRequest,
) {
  const member = await editAccess(user, shopId, staffId);
  await db.$transaction([
    db.weeklyHours.deleteMany({ where: { staffId } }),
    db.weeklyHours.createMany({ data: input.weekly.map((block) => ({ ...block, staffId })) }),
    db.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: 'schedule.weekly',
        entity: 'staff',
        entityId: staffId,
      },
    }),
  ]);
  return buildSchedule(member, true);
}

/** Today onward, in order, and no longer than a long holiday. */
function checkRange(fromKey: string, toKey: string) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  const today = tashkentDate(new Date());
  if (
    !from ||
    !to ||
    daysBetween(today, from) < 0 ||
    daysBetween(today, from) > 366 ||
    daysBetween(from, to) < 0 ||
    daysBetween(from, to) >= MAX_CHANGE_DAYS
  ) {
    refuse('bad_dates');
  }
  return { from, to };
}

type NewRow = Pick<OverrideRow, 'type' | 'startMin' | 'endMin'> & { reason: ChangeReason };

/** A date's change replaces whatever was set for that date before. */
async function replaceDays(
  user: User,
  shopId: string,
  staffId: string,
  from: CalendarDate,
  to: CalendarDate,
  perDay: NewRow[],
) {
  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
  await db.$transaction([
    db.scheduleOverride.deleteMany({
      where: { staffId, date: { gte: dbDate(from), lte: dbDate(to) } },
    }),
    db.scheduleOverride.createMany({
      data: dates.flatMap((date) => perDay.map((row) => ({ ...row, staffId, date: dbDate(date) }))),
    }),
    db.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: 'schedule.change',
        entity: 'staff',
        entityId: staffId,
        data: { from: dateKey(from), to: dateKey(to) },
      },
    }),
  ]);
}

export async function addChange(user: User, shopId: string, staffId: string, input: ChangeRequest) {
  const member = await editAccess(user, shopId, staffId);

  if (input.kind === 'leave_at') {
    const { from: date } = checkRange(input.date, input.date);
    const current = await buildSchedule(member, true);
    const overrides = await db.scheduleOverride.findMany({
      where: { staffId, date: dbDate(date) },
      select: { date: true, type: true, startMin: true, endMin: true, reason: true },
    });
    const blocks = clipBlocks(
      windowsAsBlocks(date, current.weekly, overrides.map(rowOverride)),
      input.leaveAt,
    );
    if (blocks.length === 0) refuse('not_working_today');
    await replaceDays(
      user,
      shopId,
      staffId,
      date,
      date,
      blocks.map((block) => ({ type: 'CUSTOM_HOURS', reason: 'leave_early', ...block })),
    );
  } else {
    const { from, to } = checkRange(input.from, input.to);
    const rows: NewRow[] =
      input.kind === 'day_off'
        ? [{ type: 'DAY_OFF', reason: input.reason, startMin: null, endMin: null }]
        : input.blocks.map((block) => ({
            type: 'CUSTOM_HOURS',
            reason: input.reason,
            ...block,
          }));
    await replaceDays(user, shopId, staffId, from, to, rows);
  }
  return buildSchedule(member, true);
}

/** Goes back to the weekly hours for those dates. */
export async function removeChange(
  user: User,
  shopId: string,
  staffId: string,
  range: { from: string; to: string },
) {
  const member = await editAccess(user, shopId, staffId);
  const from = parseDateKey(range.from);
  const to = parseDateKey(range.to);
  if (!from || !to) refuse('bad_dates');
  await replaceDays(user, shopId, staffId, from, to, []);
  return buildSchedule(member, true);
}
