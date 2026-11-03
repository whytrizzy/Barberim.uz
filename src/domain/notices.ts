/**
 * Live notices about a visit on the day: "your turn is next", "we're running late", "I'm running
 * late". Pure rules on when they make sense; sending lives in server/services/notices.
 */

const MIN_MS = 60_000;

/** How late the shop can say it's running. */
export const SHOP_DELAY_OPTIONS = [10, 15, 20, 30, 45] as const;
/** How late a client can say they're running. */
export const CLIENT_LATE_OPTIONS = [5, 10, 15, 20, 30] as const;
/** Each side can update their estimate a few times, not flood the other. */
export const MAX_NOTICES_PER_SIDE = 3;

/** Running-late notices: from a few hours before the start until a little after it. */
const LATE_FROM_MIN = 180;
const LATE_UNTIL_MIN = 30;
/** "Your turn is next": only close to the start, when coming now makes sense. */
const NEXT_UP_FROM_MIN = 60;
/** Marking the previous visit done tells the next client if they're due within this long. */
export const AUTO_NEXT_UP_WITHIN_MIN = 45;

type Visit = { status: string; startAt: Date };

const active = (visit: Visit) => visit.status === 'PENDING' || visit.status === 'CONFIRMED';

function within(visit: Visit, now: Date, fromMin: number, untilMin: number): boolean {
  const offset = (now.getTime() - visit.startAt.getTime()) / MIN_MS;
  return active(visit) && offset >= -fromMin && offset <= untilMin;
}

export function canSayLate(visit: Visit, now: Date): boolean {
  return within(visit, now, LATE_FROM_MIN, LATE_UNTIL_MIN);
}

export function canSayNextUp(visit: Visit, now: Date): boolean {
  return visit.status === 'CONFIRMED' && within(visit, now, NEXT_UP_FROM_MIN, LATE_UNTIL_MIN);
}

/** A notice that arrives once the visit is well under way only confuses. */
export function noticeStillUseful(startAt: Date, now: Date): boolean {
  return now.getTime() - startAt.getTime() <= LATE_UNTIL_MIN * MIN_MS;
}
