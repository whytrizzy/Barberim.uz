/**
 * Booking rules that don't need a database: which status changes are allowed, by whom and when,
 * and how a booking's items and total are frozen from the services. Pure and fully unit-tested.
 */

export type BookingStatus =
  'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED_CLIENT' | 'CANCELLED_SHOP';

export type BookingAction = 'confirm' | 'cancel' | 'complete' | 'no_show' | 'reschedule';

/** Who is acting: the client who booked, or a staff member of the shop. */
export type ActorKind = 'client' | 'staff';

export const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export type TransitionRefusal =
  | 'not_allowed' // this actor can never do this
  | 'wrong_status' // e.g. completing a cancelled booking
  | 'not_started' // completed / no-show only once the booking has started
  | 'already_started'; // clients can't cancel or move a booking that has begun

export type TransitionResult =
  | { ok: true; to: BookingStatus | null } // null: status stays (reschedule)
  | { ok: false; reason: TransitionRefusal };

const rules: Record<
  BookingAction,
  { actors: ActorKind[]; from: BookingStatus[]; to: (actor: ActorKind) => BookingStatus | null }
> = {
  confirm: { actors: ['staff'], from: ['PENDING'], to: () => 'CONFIRMED' },
  cancel: {
    actors: ['client', 'staff'],
    from: ['PENDING', 'CONFIRMED'],
    to: (actor) => (actor === 'client' ? 'CANCELLED_CLIENT' : 'CANCELLED_SHOP'),
  },
  // Staff may correct a mistaken mark between completed and no-show.
  complete: { actors: ['staff'], from: ['CONFIRMED', 'PENDING', 'NO_SHOW'], to: () => 'COMPLETED' },
  no_show: { actors: ['staff'], from: ['CONFIRMED', 'PENDING', 'COMPLETED'], to: () => 'NO_SHOW' },
  reschedule: { actors: ['client', 'staff'], from: ['PENDING', 'CONFIRMED'], to: () => null },
};

export function checkTransition(
  action: BookingAction,
  actor: ActorKind,
  booking: { status: BookingStatus; startAt: Date },
  now: Date,
): TransitionResult {
  const rule = rules[action];
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'not_allowed' };
  if (!rule.from.includes(booking.status)) return { ok: false, reason: 'wrong_status' };
  const started = now.getTime() >= booking.startAt.getTime();
  if ((action === 'complete' || action === 'no_show') && !started) {
    return { ok: false, reason: 'not_started' };
  }
  if (actor === 'client' && (action === 'cancel' || action === 'reschedule') && started) {
    return { ok: false, reason: 'already_started' };
  }
  return { ok: true, to: rule.to(actor) };
}

/** A service as one master offers it: their own price/duration override the shop's. */
export type OfferedService = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  priceOverride?: number | null;
  durationOverride?: number | null;
};

export type ItemSnapshot = {
  serviceId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  durationSnapshot: number;
  sortOrder: number;
};

/** Freezes the chosen services into booking items, keeping the order the client chose. */
export function priceBooking(services: OfferedService[]): {
  items: ItemSnapshot[];
  totalPrice: number;
  durationMin: number;
} {
  const items = services.map((s, i) => ({
    serviceId: s.id,
    nameSnapshot: s.name,
    priceSnapshot: s.priceOverride ?? s.price,
    durationSnapshot: s.durationOverride ?? s.durationMin,
    sortOrder: i,
  }));
  return {
    items,
    totalPrice: items.reduce((sum, item) => sum + item.priceSnapshot, 0),
    durationMin: items.reduce((sum, item) => sum + item.durationSnapshot, 0),
  };
}
