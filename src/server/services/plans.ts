import 'server-only';
import { hasFeature, type ProFeature, type ShopPlan } from '@/domain/plans';
import { db } from '../db/client';
import { AppError } from '../http/errors';

export async function shopPlan(shopId: string): Promise<ShopPlan> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { plan: true } });
  return shop?.plan ?? 'FREE';
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
