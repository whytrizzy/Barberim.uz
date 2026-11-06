/**
 * What each plan includes. FREE is a solo barber taking bookings online; PRO adds a team and the
 * business tools. Nothing a shop made is deleted on FREE: it just can't open or add more of it.
 */

export type ShopPlan = 'FREE' | 'PRO';

/** The PRO-only features, as the server refuses them and the app labels them. */
export const PRO_FEATURES = [
  /** More than one person on the team. */
  'team',
  'earnings',
  /** Client notes, the blacklist and the client list. */
  'clients',
  'wedding_packages',
  /** The full portfolio; FREE keeps a few photos. */
  'portfolio',
] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

export const PLAN_LIMITS = {
  FREE: { staff: 1, portfolioPhotos: 3 },
  PRO: { staff: 50, portfolioPhotos: 12 },
} as const satisfies Record<ShopPlan, { staff: number; portfolioPhotos: number }>;

/** Whether a shop on this plan may use the feature. */
export function hasFeature(plan: ShopPlan, feature: ProFeature): boolean {
  return plan === 'PRO' || !(PRO_FEATURES as readonly string[]).includes(feature);
}

export function planLimits(plan: ShopPlan) {
  return PLAN_LIMITS[plan];
}

/** What a PRO payment buys. */
export const PRO_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * The plan a shop has right now. Until billing is switched on, the stored plan (PRO for everyone);
 * once it is, PRO only while paid up.
 */
export function effectivePlan(
  shop: { plan: ShopPlan; planUntil: Date | null },
  billingEnforced: boolean,
  now: Date,
): ShopPlan {
  if (!billingEnforced) return shop.plan;
  return shop.planUntil && shop.planUntil.getTime() > now.getTime() ? 'PRO' : 'FREE';
}

/** A payment adds its days after any time already paid, never before today. */
export function extendPlan(planUntil: Date | null, now: Date, days = PRO_PERIOD_DAYS): Date {
  const from = planUntil && planUntil.getTime() > now.getTime() ? planUntil : now;
  return new Date(from.getTime() + days * DAY_MS);
}
