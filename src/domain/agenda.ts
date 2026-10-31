/**
 * One master's working day as a list to read top to bottom: bookings, free gaps and breaks.
 * Pure, in minutes since Tashkent midnight of the day being shown.
 */
import { checkTransition, type BookingAction, type BookingStatus } from './booking';

export type AgendaWindow = { startMin: number; endMin: number };

export type AgendaBooking = { startMin: number; endMin: number; status: BookingStatus };

export type AgendaRow<B> =
  | { kind: 'booking'; startMin: number; endMin: number; booking: B; current: boolean }
  | { kind: 'free' | 'break'; startMin: number; endMin: number };

export const isCancelled = (status: BookingStatus) =>
  status === 'CANCELLED_CLIENT' || status === 'CANCELLED_SHOP';

/** Too short to fit anyone: not worth a row. */
const MIN_GAP = 5;

/**
 * `nowMin` is the current minute when showing today (null for other days): the client in the
 * chair is marked, and free time and breaks already gone aren't listed. Cancelled bookings don't
 * take up time, so pass only the others.
 */
export function buildAgenda<B extends AgendaBooking>(
  windows: AgendaWindow[],
  bookings: B[],
  nowMin: number | null,
): AgendaRow<B>[] {
  const sorted = [...bookings].sort((a, b) => a.startMin - b.startMin);

  const open: { kind: 'free' | 'break'; startMin: number; endMin: number }[] = [];
  windows.forEach((window, i) => {
    const previous = windows[i - 1];
    if (previous) open.push({ kind: 'break', startMin: previous.endMin, endMin: window.startMin });
    open.push({ kind: 'free', startMin: window.startMin, endMin: window.endMin });
  });

  const rows: AgendaRow<B>[] = [];
  for (const segment of open) {
    let cursor = Math.max(segment.startMin, nowMin ?? segment.startMin);
    const pieces: { startMin: number; endMin: number }[] = [];
    for (const booking of sorted) {
      if (booking.endMin <= cursor || booking.startMin >= segment.endMin) continue;
      if (booking.startMin > cursor) pieces.push({ startMin: cursor, endMin: booking.startMin });
      cursor = Math.max(cursor, booking.endMin);
    }
    if (cursor < segment.endMin) pieces.push({ startMin: cursor, endMin: segment.endMin });
    for (const piece of pieces) {
      if (piece.endMin - piece.startMin >= MIN_GAP) rows.push({ kind: segment.kind, ...piece });
    }
  }
  for (const booking of sorted) {
    rows.push({
      kind: 'booking',
      startMin: booking.startMin,
      endMin: booking.endMin,
      booking,
      current:
        nowMin !== null &&
        booking.startMin <= nowMin &&
        nowMin < booking.endMin &&
        (booking.status === 'CONFIRMED' || booking.status === 'PENDING'),
    });
  }
  return rows.sort((a, b) => a.startMin - b.startMin);
}

/** How many clients and how much money the day holds; cancelled and no-shows don't count. */
export function daySummary(bookings: { status: BookingStatus; totalPrice: number }[]) {
  const counted = bookings.filter((b) => !isCancelled(b.status) && b.status !== 'NO_SHOW');
  return { count: counted.length, total: counted.reduce((sum, b) => sum + b.totalPrice, 0) };
}

/** What staff can do with a booking right now, most likely first. */
export function staffActions(
  booking: { status: BookingStatus; startAt: Date },
  now: Date,
): BookingAction[] {
  const order: BookingAction[] = ['confirm', 'complete', 'no_show', 'reschedule', 'cancel'];
  return order.filter((action) => checkTransition(action, 'staff', booking, now).ok);
}
