import 'server-only';
import { extendPlan, PRO_PERIOD_DAYS } from '@/domain/plans';
import type { BillingPayload } from '@/bot/notifications';
import { clientEnv } from '@/env/client';
import type { BillingDto, CheckoutDto, PaymentProviderName } from '@/features/billing/schemas';
import type { Locale } from '@/i18n/locales';
import type { Prisma, User } from '@/generated/prisma/client';
import { fromDbLocale, requireStaff } from '../auth/auth';
import { clickConfig, paymeConfig, proPrice } from '../billing/config';
import { db } from '../db/client';
import { AppError } from '../http/errors';
import { billingEnforced, planOf } from './plans';

// Subscription billing: the owner opens Payme's or Click's checkout for a month of PRO; the
// provider then calls /api/billing/* (billing/payme.ts, billing/click.ts) to confirm, and
// settlePayment extends the shop's paid time.

const HISTORY = 12;

export function availableProviders(): PaymentProviderName[] {
  return [
    ...(paymeConfig() ? ['PAYME' as const] : []),
    ...(clickConfig() ? ['CLICK' as const] : []),
  ];
}

export async function getBilling(user: User, shopId: string): Promise<BillingDto> {
  const me = await requireStaff(user.id, shopId);
  const [shop, payments] = await Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { plan: true, planUntil: true } }),
    db.payment.findMany({
      where: { shopId, status: { not: 'PENDING' } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
    }),
  ]);
  return {
    plan: planOf(shop),
    planUntil: shop.planUntil?.toISOString() ?? null,
    enforced: billingEnforced(),
    price: proPrice(),
    days: PRO_PERIOD_DAYS,
    providers: availableProviders(),
    canPay: me.role === 'OWNER',
    payments: payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      amount: p.amount,
      status: p.status,
      at: (p.paidAt ?? p.updatedAt).toISOString(),
    })),
  };
}

/** Where the provider sends the owner back: the bot's chat, where the receipt message arrives. */
function returnUrl(): string {
  return `https://t.me/${clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot'}`;
}

function paymeUrl(paymentId: string, amount: number, locale: Locale): string {
  const config = paymeConfig()!;
  const lang = locale === 'ru' ? 'ru' : 'uz';
  const query = `m=${config.merchantId};ac.order_id=${paymentId};a=${amount * 100};c=${returnUrl()};l=${lang}`;
  const host = config.test ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${host}/${Buffer.from(query).toString('base64')}`;
}

function clickUrl(paymentId: string, amount: number): string {
  const config = clickConfig()!;
  const query = new URLSearchParams({
    service_id: config.serviceId,
    merchant_id: config.merchantId,
    amount: String(amount),
    transaction_param: paymentId,
    return_url: returnUrl(),
  });
  return `https://my.click.uz/services/pay?${query.toString()}`;
}

/** A month of PRO: a new order, and the provider's checkout to pay it. Owners only. */
export async function startCheckout(
  user: User,
  shopId: string,
  provider: PaymentProviderName,
): Promise<CheckoutDto> {
  await requireStaff(user.id, shopId, ['OWNER']);
  if (!availableProviders().includes(provider)) {
    throw new AppError('invalid_input', 'provider not available', {
      reason: 'provider_unavailable',
    });
  }
  const amount = proPrice();
  const payment = await db.payment.create({
    data: { shopId, userId: user.id, provider, amount, days: PRO_PERIOD_DAYS },
  });
  const locale = fromDbLocale(user.locale);
  return {
    paymentId: payment.id,
    url: provider === 'PAYME' ? paymeUrl(payment.id, amount, locale) : clickUrl(payment.id, amount),
  };
}

type ProviderFields = Pick<
  Prisma.PaymentUpdateInput,
  'providerState' | 'performTime' | 'cancelTime' | 'cancelReason'
>;

/**
 * The provider confirmed the money: the order is paid, the shop's PRO runs on, and its owner hears.
 * Safe to call twice: only a pending order is settled.
 */
export async function settlePayment(paymentId: string, fields: ProviderFields, now = new Date()) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { ...fields, status: 'PAID', paidAt: now },
    });
    if (count === 0) return;
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { shop: true },
    });
    const until = extendPlan(payment.shop.planUntil, now, payment.days);
    await tx.shop.update({
      where: { id: payment.shopId },
      data: { plan: 'PRO', planUntil: until },
    });
    await tx.auditLog.create({
      data: {
        shopId: payment.shopId,
        actorUserId: payment.userId,
        action: 'billing.paid',
        entity: 'payment',
        entityId: payment.id,
        data: { provider: payment.provider, amount: payment.amount, until: until.toISOString() },
      },
    });
    const owner = payment.userId
      ? await tx.user.findUnique({ where: { id: payment.userId } })
      : null;
    if (owner) {
      const payload: BillingPayload = {
        shopId: payment.shopId,
        shopName: payment.shop.name,
        until: until.toISOString(),
        locale: fromDbLocale(owner.locale),
      };
      await tx.notification.create({
        data: { chatId: owner.telegramId, template: 'billing.paid', payload, sendAt: now },
      });
    }
  });
}

/** The order won't be paid: cancelled by the provider, or it timed out. Only a pending one. */
export async function cancelPayment(paymentId: string, fields: ProviderFields) {
  await db.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { ...fields, status: 'CANCELLED' },
  });
}
