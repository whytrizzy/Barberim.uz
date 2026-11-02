import 'server-only';
import { dayAvailability } from '@/domain/availability';
import { ACTIVE_STATUSES, checkTransition } from '@/domain/booking';
import { addDays, dateKey, tashkentDate } from '@/domain/time';
import type { BookingOptions, MyBookingDto, MyBookingsDto } from '@/features/booking/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { dayInput, loadSchedule } from './availability';
import { toBookingDto } from './booking';

/** How much history the list keeps on screen. */
const PAST_LIMIT = 30;
/** Same reach as the booking flow. */
const MOVE_DAYS = 14;

const myBookingInclude = {
  items: { orderBy: { sortOrder: 'asc' } },
  staff: { select: { displayName: true } },
  shop: {
    select: { slug: true, name: true, address: true, landmark: true, lat: true, lng: true },
  },
} satisfies Prisma.BookingInclude;

type Row = Prisma.BookingGetPayload<{ include: typeof myBookingInclude }>;

function toMyBooking(row: Row): MyBookingDto {
  const { shop } = row;
  return {
    ...toBookingDto(row),
    masterName: row.staff.displayName,
    shop: {
      slug: shop.slug,
      name: shop.name,
      address: shop.address,
      landmark: shop.landmark,
      location: shop.lat !== null && shop.lng !== null ? { lat: shop.lat, lng: shop.lng } : null,
    },
  };
}

/** The signed-in person's bookings at every shop, by whose client record they belong to. */
const mine = (user: User) => ({ client: { userId: user.id } });

export async function listMyBookings(user: User, now = new Date()): Promise<MyBookingsDto> {
  const upcomingWhere = { status: { in: ACTIVE_STATUSES }, endAt: { gt: now } };
  const [upcoming, past] = await Promise.all([
    db.booking.findMany({
      where: { ...mine(user), ...upcomingWhere },
      include: myBookingInclude,
      orderBy: { startAt: 'asc' },
    }),
    db.booking.findMany({
      where: { ...mine(user), NOT: upcomingWhere },
      include: myBookingInclude,
      orderBy: { startAt: 'desc' },
      take: PAST_LIMIT,
    }),
  ]);
  return { upcoming: upcoming.map(toMyBooking), past: past.map(toMyBooking) };
}

async function findMine(user: User, bookingId: string): Promise<Row> {
  const row = await db.booking.findFirst({
    where: { id: bookingId, ...mine(user) },
    include: myBookingInclude,
  });
  // Someone else's booking looks the same as one that doesn't exist.
  if (!row) throw new AppError('not_found', 'booking not found');
  return row;
}

export async function getMyBooking(user: User, bookingId: string): Promise<MyBookingDto> {
  return toMyBooking(await findMine(user, bookingId));
}

/** Where a booking can move: same master, same length, not counting the booking itself. */
export async function getMoveOptions(
  user: User,
  bookingId: string,
  now = new Date(),
): Promise<BookingOptions> {
  const booking = await findMine(user, bookingId);
  if (!checkTransition('reschedule', 'client', booking, now).ok) {
    throw new AppError('conflict', 'cannot move', { reason: 'transition_refused' });
  }
  const from = tashkentDate(now);
  const schedule = await loadSchedule(booking.staffId, from, MOVE_DAYS, {
    excludeBookingId: booking.id,
  });
  const durationMin = (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000;
  return {
    days: Array.from({ length: MOVE_DAYS }, (_, i) => {
      const date = addDays(from, i);
      const day = dayAvailability(dayInput(schedule, date, durationMin, now));
      const slots = day.slots
        .filter((slot) => slot.state === 'available')
        // Its current time isn't somewhere to move to.
        .filter((slot) => slot.startAt.getTime() !== booking.startAt.getTime())
        .map((slot) => ({ startMin: slot.startMin, startAt: slot.startAt.toISOString() }));
      return { date: dateKey(date), status: slots.length > 0 ? day.status : 'full', slots };
    }),
  };
}
