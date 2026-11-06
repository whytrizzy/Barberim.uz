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
