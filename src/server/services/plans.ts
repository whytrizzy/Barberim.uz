import 'server-only';
import { effectivePlan, hasFeature, type ProFeature, type ShopPlan } from '@/domain/plans';
import { serverEnv } from '@/env/server';
import { db } from '../db/client';
import { AppError } from '../http/errors';

/** Subscription billing switched on: PRO only while paid up. */
export const billingEnforced = () => serverEnv.BILLING_ENFORCED === true;

/** The plan in force for this shop right now (see domain/plans effectivePlan). */
export function planOf(shop: { plan: ShopPlan; planUntil: Date | null }, now = new Date()) {
  return effectivePlan(shop, billingEnforced(), now);
}

export async function shopPlan(shopId: string): Promise<ShopPlan> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { plan: true, planUntil: true },
  });
  return shop ? planOf(shop) : 'FREE';
}

/** The app shows "this is a PRO feature" for `details.reason` plan_limit, naming the feature. */
export function refusePlan(feature: ProFeature): never {
  throw new AppError('forbidden', `plan_limit: ${feature}`, { reason: 'plan_limit', feature });
}

/** Refuses a PRO feature for a shop on FREE. */
export async function requireFeature(shopId: string, feature: ProFeature): Promise<ShopPlan> {
  const plan = await shopPlan(shopId);
  if (!hasFeature(plan, feature)) refusePlan(feature);
  return plan;
}
