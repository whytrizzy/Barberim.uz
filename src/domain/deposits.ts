/**
 * Online deposits: when a client has to pay something up front to book, and what happens to the
 * money afterwards. Pure rules; the money moves through the shop's own Payme, Click or Uzum account.
 */

/** An unpaid deposit holds the time this long, then the time is free again. */
export const DEPOSIT_HOLD_MINUTES = 30;
/** A client who cancels at least this long before the visit gets their deposit back. */
export const DEPOSIT_REFUND_NOTICE_HOURS = 24;

const HOUR_MS = 3_600_000;

/**
 * The no-show cycle: a client who missed a visit here pays a deposit next time; once a deposit is
 * paid they book as usual again, until they miss another visit.
 */
export function clientOwesDeposit(lastNoShowAt: Date | null, lastDepositPaidAt: Date | null) {
  if (!lastNoShowAt) return false;
  return !lastDepositPaidAt || lastDepositPaidAt.getTime() < lastNoShowAt.getTime();
}

export type DepositRules = {
  /** UZS; 0 or less: the shop takes no deposits. */
  amount: number;
  /** Ask clients who missed a visit (the no-show cycle). */
  afterNoShow: boolean;
};

/** The deposit to ask for this booking, or null for none. */
export function depositFor(
  rules: DepositRules,
  {
    hasProvider,
    masterRequires,
    clientOwes,
  }: { hasProvider: boolean; masterRequires: boolean; clientOwes: boolean },
): number | null {
  // Without a connected Payme, Click or Uzum account the client couldn't pay, so nothing is asked.
  if (!hasProvider || rules.amount <= 0) return null;
  return masterRequires || (rules.afterNoShow && clientOwes) ? rules.amount : null;
}

export type DepositOutcome = 'refund' | 'keep';

/**
 * What happens to a paid deposit when the visit doesn't go ahead: the shop cancelling always
 * refunds it; the client cancelling refunds it only with enough notice; a no-show keeps it.
 */
export function depositOutcome(
  event: 'shop_cancel' | 'client_cancel' | 'no_show',
  startAt: Date,
  now: Date,
): DepositOutcome {
  if (event === 'shop_cancel') return 'refund';
  if (event === 'no_show') return 'keep';
  return startAt.getTime() - now.getTime() >= DEPOSIT_REFUND_NOTICE_HOURS * HOUR_MS
    ? 'refund'
    : 'keep';
}
