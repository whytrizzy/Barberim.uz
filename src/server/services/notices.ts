import 'server-only';
import { canSayLate, canSayNextUp, MAX_NOTICES_PER_SIDE } from '@/domain/notices';
import type { BookingDto, BookingNoticeRequest, NoticeRefusal } from '@/features/booking/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { toBookingDto } from './booking';
import { queueBookingMessage, queueStaffAlert } from './notifications';

// Live notices on the day of a visit. The client says they're running late (the shop hears); the
// shop says the master is running late, or that it's the client's turn next (the client hears).

function refuse(reason: NoticeRefusal): never {
  throw new AppError('conflict', reason, { reason });
}

const auditAction = (kind: BookingNoticeRequest['kind']) => `booking.notice.${kind}`;

export async function sendBookingNotice(
  user: User,
  bookingId: string,
  input: BookingNoticeRequest,
  now = new Date(),
): Promise<BookingDto> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { client: { select: { userId: true } } },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');

  if (input.kind === 'client_late') {
    // Someone else's booking looks the same as one that doesn't exist.
    if (booking.client.userId !== user.id) throw new AppError('not_found', 'booking not found');
    if (!canSayLate(booking, now)) refuse('not_now');
  } else {
    const staff = await requireStaff(user.id, booking.shopId);
    if (staff.role === 'MASTER' && staff.id !== booking.staffId) {
      throw new AppError('forbidden', 'not your booking');
    }
    const allowed =
      input.kind === 'next_up' ? canSayNextUp(booking, now) : canSayLate(booking, now);
    if (!allowed) refuse('not_now');
  }

  const said = await db.auditLog.count({
    where: { entity: 'booking', entityId: booking.id, action: auditAction(input.kind) },
  });
  if (said >= MAX_NOTICES_PER_SIDE) refuse('too_many_notices');

  const data: Prisma.BookingUpdateInput =
    input.kind === 'client_late'
      ? { clientLateMin: input.minutes }
      : input.kind === 'shop_delay'
        ? { shopDelayMin: input.minutes }
        : {};
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: booking.id },
      data,
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (input.kind === 'client_late') {
      await queueStaffAlert(tx, booking.id, {
        template: 'staff.client_late',
        actorUserId: user.id,
        audience: 'shop',
        minutes: input.minutes,
      });
    } else if (input.kind === 'shop_delay') {
      await queueBookingMessage(tx, 'booking.running_late', booking.id, now, {
        minutes: input.minutes,
      });
    } else {
      await queueBookingMessage(tx, 'booking.next_up', booking.id, now);
    }
    await tx.auditLog.create({
      data: {
        shopId: booking.shopId,
        actorUserId: user.id,
        action: auditAction(input.kind),
        entity: 'booking',
        entityId: booking.id,
        data: 'minutes' in input ? { minutes: input.minutes } : {},
      },
    });
    return row;
  });
  return toBookingDto(updated);
}
