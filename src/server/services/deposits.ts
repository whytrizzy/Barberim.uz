import 'server-only';
import {
  clientOwesDeposit,
  DEPOSIT_HOLD_MINUTES,
  depositFor,
  depositOutcome,
} from '@/domain/deposits';
import { clientEnv } from '@/env/client';
import type {
  DepositProvider,
  DepositRefusal,
  DepositSettingsDto,
  DepositSettingsRequest,
} from '@/features/deposits/schemas';
import { parseShopSettings } from '@/features/shop/schemas';
import type { Deposit, PaymentProvider, Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { canStoreSecrets, openSecret, sealSecret } from '../deposits/secrets';
import { db } from '../db/client';
import { AppError, type AppErrorCode } from '../http/errors';
import { clickCheckoutUrl } from '../payments/click';
import { paymeCheckoutUrl } from '../payments/payme';
import { returnUrl } from './billing';
import {
  cancelQueuedMessages,
  queueBookingMessage,
  queueReminders,
  queueStaffAlert,
} from './notifications';
import { queueWaitlistAlerts } from './waitlist';

// Online deposits (P3.1): a client pays the shop's own Payme, Click or Uzum account up front to
// book. Unpaid, the time is held for a while and then freed; paid, the booking goes ahead. When
// the visit is called off, the money is refunded or kept by the rules in domain/deposits.

const MINUTE_MS = 60_000;
/** A payment the provider has started is left to finish this long past the hold. */
const IN_FLIGHT_GRACE_MS = 15 * MINUTE_MS;

function refuse(reason: DepositRefusal, code: AppErrorCode = 'conflict'): never {
  throw new AppError(code, reason, { reason });
}

/** A shop's connected provider account, with its secret opened. */
export async function shopAccount(shopId: string, provider: PaymentProvider) {
  const row = await db.shopPaymentAccount.findUnique({
    where: { shopId_provider: { shopId, provider } },
  });
  if (!row?.isActive) return null;
  try {
    return { ...row, secret: openSecret(row.secretCipher) };
  } catch {
    // The encryption key changed or the value was altered: treat the account as not connected.
    return null;
  }
}

export async function connectedProviders(shopId: string): Promise<DepositProvider[]> {
  const rows = await db.shopPaymentAccount.findMany({
    where: { shopId, isActive: true },
    select: { provider: true },
    orderBy: { provider: 'asc' },
  });
  return rows.map((row) => row.provider);
}

/** Whether this person missed a visit here and hasn't paid a deposit since (the no-show cycle). */
export async function owesDeposit(shopId: string, userId: string): Promise<boolean> {
  const [noShow, paid] = await Promise.all([
    db.booking.findFirst({
      where: { shopId, status: 'NO_SHOW', client: { userId } },
      // When the miss was recorded, not when the visit was: a deposit paid before the shop marked
      // it doesn't clear it.
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    db.deposit.findFirst({
      where: { shopId, paidAt: { not: null }, booking: { client: { userId } } },
      orderBy: { paidAt: 'desc' },
      select: { paidAt: true },
    }),
  ]);
  return clientOwesDeposit(noShow?.updatedAt ?? null, paid?.paidAt ?? null);
}

/** The deposit to ask for a booking with this master, or null. */
export async function depositNeeded(
  shopId: string,
  staffId: string,
  userId: string,
  settings: unknown,
): Promise<number | null> {
  const rules = parseShopSettings(settings);
  if (rules.depositAmount <= 0) return null;
  const [providers, master, owes] = await Promise.all([
    connectedProviders(shopId),
    db.staff.findUnique({ where: { id: staffId }, select: { requiresDeposit: true } }),
    owesDeposit(shopId, userId),
  ]);
  return depositFor(
    { amount: rules.depositAmount, afterNoShow: rules.depositAfterNoShow },
    {
      hasProvider: providers.length > 0,
      masterRequires: master?.requiresDeposit ?? false,
      clientOwes: owes,
    },
  );
}

/** Holds a just-made booking (the first of a family) for its deposit. */
export async function holdForDeposit(
  tx: Prisma.TransactionClient,
  booking: { id: string; shopId: string },
  amount: number,
  now = new Date(),
): Promise<Deposit> {
  return tx.deposit.create({
    data: {
      shopId: booking.shopId,
      bookingId: booking.id,
      amount,
      expiresAt: new Date(now.getTime() + DEPOSIT_HOLD_MINUTES * MINUTE_MS),
    },
  });
}

/** The bookings a deposit covers: the whole family when it was booked together. */
async function coveredBookings(tx: Prisma.TransactionClient, bookingId: string) {
  const first = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  return first.groupId
    ? tx.booking.findMany({ where: { groupId: first.groupId }, orderBy: { startAt: 'asc' } })
    : [first];
}

type ProviderFields = Pick<
  Prisma.DepositUpdateInput,
  'providerState' | 'performTime' | 'cancelTime' | 'cancelReason'
>;

/**
 * The provider took the money: the deposit is paid and the booking goes ahead, told to the
 * client and the shop now (they heard nothing while it was held). Safe to call twice.
 */
export async function settleDeposit(depositId: string, fields: ProviderFields, now = new Date()) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.deposit.updateMany({
      where: { id: depositId, status: 'AWAITING' },
      data: { ...fields, status: 'PAID', paidAt: now },
    });
    if (count === 0) return;
    const deposit = await tx.deposit.findUniqueOrThrow({
      where: { id: depositId },
      include: {
        shop: { select: { settings: true } },
        booking: { select: { depositAmount: true, client: { select: { userId: true } } } },
      },
    });
    const bookings = (await coveredBookings(tx, deposit.bookingId)).filter(
      (b) => b.status === 'PENDING',
    );
    const first = bookings[0];
    if (!first) return;
    // A shop that approves bookings, or a wedding prepayment it settles by hand, still decides.
    const waits =
      parseShopSettings(deposit.shop.settings).requireApproval ||
      deposit.booking.depositAmount !== null;
    if (!waits) {
      await tx.booking.updateMany({
        where: { id: { in: bookings.map((b) => b.id) } },
        data: { status: 'CONFIRMED' },
      });
    }
    await queueBookingMessage(tx, waits ? 'booking.requested' : 'booking.created', first.id);
    await queueStaffAlert(tx, first.id, {
      template: waits ? 'staff.request' : 'staff.new_booking',
      actorUserId: deposit.booking.client.userId ?? '',
      audience: 'shop',
    });
    await queueReminders(tx, first.id, first.startAt, now);
  });
}

/** Never paid (the hold ran out, or the provider gave up): the booking is off, the time free. */
export async function dropUnpaidDeposit(
  depositId: string,
  fields: ProviderFields = {},
  now = new Date(),
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.deposit.updateMany({
      where: { id: depositId, status: 'AWAITING' },
      data: { ...fields, status: 'CANCELLED' },
    });
    if (count === 0) return false;
    const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
    const bookings = (await coveredBookings(tx, deposit.bookingId)).filter(
      (b) => b.status === 'PENDING',
    );
    for (const booking of bookings) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED_CLIENT', cancelledAt: now, cancelReason: 'deposit_not_paid' },
      });
      await cancelQueuedMessages(tx, booking.id);
      await queueWaitlistAlerts(tx, booking, now);
    }
    if (bookings[0]) await queueBookingMessage(tx, 'booking.deposit_expired', bookings[0].id, now);
    return true;
  });
}

/** Run with the outbox: frees the time of deposits not paid in time. */
export async function expireDeposits(now = new Date()): Promise<number> {
  const due = await db.deposit.findMany({
    where: { status: 'AWAITING', expiresAt: { lt: now } },
    select: { id: true, providerTime: true },
    take: 100,
  });
  let dropped = 0;
  for (const deposit of due) {
    // The client is paying right now: give the provider a little longer to finish.
    const started = deposit.providerTime === null ? null : Number(deposit.providerTime);
    if (started !== null && now.getTime() - started < IN_FLIGHT_GRACE_MS) continue;
    if (await dropUnpaidDeposit(deposit.id, {}, now)) dropped++;
  }
  return dropped;
}

/**
 * A booking with a deposit changed, inside that change's transaction: what the money does now.
 * The shop cancelling refunds it; the client cancelling refunds it with a day's notice; a no-show
 * keeps it; the shop confirming before it's paid waives it.
 */
export async function applyDepositRules(
  tx: Prisma.TransactionClient,
  booking: { id: string; startAt: Date },
  action: 'cancel' | 'no_show' | 'complete' | 'confirm' | 'reschedule',
  as: 'client' | 'staff',
  actorUserId: string,
  now = new Date(),
): Promise<void> {
  const deposit = await tx.deposit.findUnique({ where: { bookingId: booking.id } });
  if (!deposit) return;
  const set = (status: Deposit['status']) =>
    tx.deposit.update({ where: { id: deposit.id }, data: { status } });

  if (deposit.status === 'AWAITING') {
    if (action === 'cancel') await set('CANCELLED');
    if (action === 'confirm') {
      await set('CANCELLED');
      // Held bookings had no reminders; a waived deposit makes it an ordinary booking.
      await queueReminders(tx, booking.id, booking.startAt, now);
    }
    return;
  }
  if (deposit.status === 'PAID' && (action === 'cancel' || action === 'no_show')) {
    const event =
      action === 'no_show' ? 'no_show' : as === 'staff' ? 'shop_cancel' : 'client_cancel';
    if (depositOutcome(event, booking.startAt, now) === 'keep') {
      await set('KEPT');
      return;
    }
    await set('REFUND_DUE');
    await queueBookingMessage(tx, 'booking.deposit_refund', booking.id, now, {
      amount: deposit.amount,
    });
    await queueStaffAlert(tx, booking.id, {
      template: 'staff.deposit_refund',
      actorUserId,
      audience: 'shop',
      amount: deposit.amount,
    });
    return;
  }
  // "No-show" corrected to "came": the deposit counts towards the visit again.
  if (deposit.status === 'KEPT' && action === 'complete') await set('PAID');
}

/** The shop sent a refund itself (Click, or by hand): the deposit is closed. Owners and admins. */
export async function markDepositRefunded(user: User, shopId: string, bookingId: string) {
  await requireStaff(user.id, shopId, ['OWNER', 'ADMIN']);
  const { count } = await db.deposit.updateMany({
    where: { bookingId, shopId, status: { in: ['REFUND_DUE', 'PAID', 'KEPT'] } },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  });
  if (count === 0) refuse('deposit_closed');
}

/** A Payme refund (CancelTransaction on a performed transaction) closes the deposit. */
export async function refundDeposit(depositId: string, fields: ProviderFields, now = new Date()) {
  await db.deposit.updateMany({
    where: { id: depositId, status: { in: ['PAID', 'REFUND_DUE', 'KEPT'] } },
    data: { ...fields, status: 'REFUNDED', refundedAt: now },
  });
}

/** A random 6-digit payment code for Uzum, free at this shop. */
async function freeCode(shopId: string): Promise<number> {
  for (;;) {
    const code = 100_000 + Math.floor(Math.random() * 900_000);
    const taken = await db.deposit.count({ where: { shopId, code } });
    if (taken === 0) return code;
  }
}

/** The client pays the deposit with one of the shop's providers: a checkout page, or an Uzum code. */
export async function startDepositCheckout(
  user: User,
  bookingId: string,
  provider: DepositProvider,
  now = new Date(),
) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, client: { userId: user.id } },
    include: { deposit: true },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');
  const deposit = booking.deposit;
  if (!deposit || deposit.status !== 'AWAITING' || deposit.expiresAt <= now) {
    refuse('deposit_closed');
  }
  // A payment already under way with one provider can't be switched to another.
  if (deposit.providerTransId && deposit.provider !== provider) refuse('deposit_closed');
  const account = await shopAccount(booking.shopId, provider);
  if (!account) refuse('provider_unavailable', 'invalid_input');

  const code = provider === 'UZUM' ? (deposit.code ?? (await freeCode(booking.shopId))) : null;
  await db.deposit.update({ where: { id: deposit.id }, data: { provider, code } });
  if (provider === 'UZUM') return { url: null, code };
  const url =
    provider === 'PAYME'
      ? paymeCheckoutUrl({
          merchantId: account.accountId,
          test: account.test,
          orderId: deposit.id,
          amount: deposit.amount,
          returnUrl: returnUrl(),
          lang: user.locale === 'ru' ? 'ru' : 'uz',
        })
      : clickCheckoutUrl({
          serviceId: account.accountId,
          merchantId: account.login ?? '',
          orderId: deposit.id,
          amount: deposit.amount,
          returnUrl: returnUrl(),
        });
  return { url, code: null };
}

/** Where a provider must call us for this shop's deposits (set in its merchant cabinet). */
export function callbackUrls(shopId: string, provider: DepositProvider): string[] {
  const base = `${clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/api/deposits`;
  if (provider === 'PAYME') return [`${base}/payme/${shopId}`];
  if (provider === 'CLICK') {
    return [`${base}/click/${shopId}/prepare`, `${base}/click/${shopId}/complete`];
  }
  return [`${base}/uzum/${shopId}`];
}

/** The owner's deposit settings: amount, the no-show rule, which masters, connected providers. */
export async function getDepositSettings(user: User, shopId: string): Promise<DepositSettingsDto> {
  await requireStaff(user.id, shopId, ['OWNER']);
  const [shop, masters, accounts] = await Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { settings: true } }),
    db.staff.findMany({
      where: { shopId, isActive: true, isBookable: true },
      select: { id: true, displayName: true, requiresDeposit: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.shopPaymentAccount.findMany({
      where: { shopId, isActive: true },
      orderBy: { provider: 'asc' },
    }),
  ]);
  const rules = parseShopSettings(shop.settings);
  return {
    amount: rules.depositAmount,
    afterNoShow: rules.depositAfterNoShow,
    masters: masters.map((m) => ({
      id: m.id,
      name: m.displayName,
      requiresDeposit: m.requiresDeposit,
    })),
    accounts: accounts.map((a) => ({
      provider: a.provider,
      accountId: a.accountId,
      login: a.login,
      test: a.test,
      hasSecret: true,
      callbackUrls: callbackUrls(shopId, a.provider),
    })),
    canConnect: canStoreSecrets(),
  };
}

/** Saves the deposit settings. A provider's secret is kept unless a new one is given. */
export async function saveDepositSettings(
  user: User,
  shopId: string,
  input: DepositSettingsRequest,
): Promise<DepositSettingsDto> {
  await requireStaff(user.id, shopId, ['OWNER']);
  if (input.accounts.some((a) => a.secret) && !canStoreSecrets()) {
    refuse('cannot_store_secrets', 'invalid_input');
  }
  const existing = await db.shopPaymentAccount.findMany({ where: { shopId } });
  for (const account of input.accounts) {
    const saved = existing.find((e) => e.provider === account.provider);
    if (!account.secret && !saved) refuse('secret_required', 'invalid_input');
  }

  await db.$transaction(async (tx) => {
    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { settings: true },
    });
    const settings = (shop.settings ?? {}) as Prisma.JsonObject;
    await tx.shop.update({
      where: { id: shopId },
      data: {
        settings: {
          ...settings,
          depositAmount: input.amount,
          depositAfterNoShow: input.afterNoShow,
        },
      },
    });
    await tx.staff.updateMany({
      where: { shopId },
      data: { requiresDeposit: false },
    });
    if (input.masterIds.length > 0) {
      await tx.staff.updateMany({
        where: { shopId, id: { in: input.masterIds } },
        data: { requiresDeposit: true },
      });
    }
    for (const account of input.accounts) {
      const fields = {
        accountId: account.accountId,
        login: 'login' in account ? account.login : null,
        test: 'test' in account ? account.test : false,
        isActive: true,
        ...(account.secret && { secretCipher: sealSecret(account.secret) }),
      };
      const saved = existing.find((e) => e.provider === account.provider);
      if (saved) {
        await tx.shopPaymentAccount.update({ where: { id: saved.id }, data: fields });
      } else {
        await tx.shopPaymentAccount.create({
          data: {
            shopId,
            provider: account.provider,
            ...fields,
            secretCipher: sealSecret(account.secret!),
          },
        });
      }
    }
    if (input.remove.length > 0) {
      await tx.shopPaymentAccount.updateMany({
        where: { shopId, provider: { in: input.remove } },
        data: { isActive: false },
      });
    }
    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: 'deposits.settings',
        entity: 'shop',
        entityId: shopId,
        // Which providers changed, never their keys.
        data: {
          amount: input.amount,
          providers: input.accounts.map((a) => a.provider),
          removed: input.remove,
        },
      },
    });
  });
  return getDepositSettings(user, shopId);
}

/** For the shop's page: the deposit, and whether this person owes one (the no-show cycle). */
export async function shopDepositInfo(shopId: string, settings: unknown, userId: string) {
  const rules = parseShopSettings(settings);
  if (rules.depositAmount <= 0) return null;
  const providers = await connectedProviders(shopId);
  if (providers.length === 0) return null;
  return {
    amount: rules.depositAmount,
    providers,
    youOwe: rules.depositAfterNoShow && (await owesDeposit(shopId, userId)),
  };
}
