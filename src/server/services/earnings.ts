import 'server-only';
import {
  periodRange,
  previousRange,
  summarizeEarnings,
  type EarningsPeriod,
  type PeriodRange,
} from '@/domain/earnings';
import {
  addDays,
  dateKey,
  startOfTashkentDay,
  tashkentDate,
  type CalendarDate,
} from '@/domain/time';
import type { EarningsDto } from '@/features/earnings/schemas';
import type { User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { requireFeature } from './plans';

const during = ({ from, days }: PeriodRange) => ({
  gte: startOfTashkentDay(from),
  lt: startOfTashkentDay(addDays(from, days)),
});

/**
 * The shop's earnings for the period around `date`. Owners and admins see the whole shop; a master
 * sees only their own visits, the way their calendar shows only their own day.
 */
export async function getEarnings(
  user: User,
  shopId: string,
  period: EarningsPeriod,
  date: CalendarDate = tashkentDate(new Date()),
): Promise<EarningsDto> {
  const me = await requireStaff(user.id, shopId);
  await requireFeature(shopId, 'earnings');
  const onlyMine = me.role === 'MASTER';
  const scope = { shopId, ...(onlyMine && { staffId: me.id }) };
  const range = periodRange(period, date);

  const [rows, previous, staff] = await Promise.all([
    db.booking.findMany({
      where: { ...scope, startAt: during(range) },
      select: {
        startAt: true,
        status: true,
        totalPrice: true,
        staffId: true,
        items: { select: { nameSnapshot: true, priceSnapshot: true } },
      },
    }),
    db.booking.aggregate({
      where: { ...scope, status: 'COMPLETED', startAt: during(previousRange(period, range)) },
      _sum: { totalPrice: true },
    }),
    // Including masters who have since left, so their past income keeps a name.
    db.staff.findMany({ where: { shopId }, select: { id: true, displayName: true } }),
  ]);

  const names = new Map(staff.map((s) => [s.id, s.displayName]));
  const sum = summarizeEarnings(
    period,
    range,
    rows.map((row) => ({
      ...row,
      items: row.items.map((item) => ({ name: item.nameSnapshot, price: item.priceSnapshot })),
    })),
  );
  return {
    ...sum,
    period,
    from: dateKey(range.from),
    days: range.days,
    onlyMine,
    previousRevenue: previous._sum.totalPrice ?? 0,
    byMaster: sum.byMaster.map((row) => ({ ...row, name: names.get(row.staffId) ?? '—' })),
  };
}
