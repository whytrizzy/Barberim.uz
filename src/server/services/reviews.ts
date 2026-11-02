import 'server-only';
import type {
  PublicReviewDto,
  RatingSummary,
  ReviewAction,
  ReviewRefusal,
  ReviewRequest,
  StaffReviewsDto,
} from '@/features/reviews/schemas';
import type { Prisma, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';

/** Shown on the shop's page, newest first. */
const PUBLIC_LIMIT = 10;
const STAFF_LIMIT = 50;

const withPeople = {
  booking: {
    select: {
      staffId: true,
      staff: { select: { displayName: true } },
      client: { select: { name: true } },
    },
  },
} satisfies Prisma.ReviewInclude;

type Row = Prisma.ReviewGetPayload<{ include: typeof withPeople }>;

function toPublic(row: Row): PublicReviewDto {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    reply: row.reply,
    // Reviews are public, so people appear by first name only.
    clientName: row.booking.client.name.trim().split(/\s+/)[0] ?? '',
    masterName: row.booking.staff.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

function refuse(reason: ReviewRefusal): never {
  throw new AppError('conflict', reason, { reason });
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown }).code === 'P2002' ||
  String((error as Error)?.message).includes('reviews_booking_id_key');

/** A client reviews their own finished visit, once. */
export async function createReview(user: User, bookingId: string, input: ReviewRequest) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, client: { userId: user.id } },
    select: { id: true, shopId: true, status: true },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');
  if (booking.status !== 'COMPLETED') refuse('not_completed');
  try {
    const review = await db.review.create({
      data: {
        bookingId,
        shopId: booking.shopId,
        rating: input.rating,
        comment: input.comment || null,
      },
    });
    return { rating: review.rating, comment: review.comment, reply: review.reply };
  } catch (error) {
    if (isUniqueViolation(error)) refuse('already_reviewed');
    throw error;
  }
}

/** The client's own review of this booking, if any. Hidden ones still show to their author. */
export async function getMyReview(user: User, bookingId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, client: { userId: user.id } },
    select: { review: { select: { rating: true, comment: true, reply: true } } },
  });
  if (!booking) throw new AppError('not_found', 'booking not found');
  return { review: booking.review };
}

export async function ratingSummary(shopId: string): Promise<RatingSummary> {
  const { _avg, _count } = await db.review.aggregate({
    where: { shopId, isHidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return { average: _avg.rating, count: _count };
}

/** Summaries for many shops at once, for search results. */
export async function ratingSummaries(shopIds: string[]): Promise<Map<string, RatingSummary>> {
  const rows = await db.review.groupBy({
    by: ['shopId'],
    where: { shopId: { in: shopIds }, isHidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return new Map(rows.map((r) => [r.shopId, { average: r._avg.rating, count: r._count }]));
}

export async function latestReviews(shopId: string): Promise<PublicReviewDto[]> {
  const rows = await db.review.findMany({
    where: { shopId, isHidden: false },
    include: withPeople,
    orderBy: { createdAt: 'desc' },
    take: PUBLIC_LIMIT,
  });
  return rows.map(toPublic);
}

/** The shop's reviews, for its staff. Moderation is the platform's job, so nothing is deleted. */
export async function listShopReviews(user: User, shopId: string): Promise<StaffReviewsDto> {
  const me = await requireStaff(user.id, shopId);
  const [summary, rows] = await Promise.all([
    ratingSummary(shopId),
    db.review.findMany({
      where: { shopId },
      include: withPeople,
      orderBy: { createdAt: 'desc' },
      take: STAFF_LIMIT,
    }),
  ]);
  const canAnswerAll = me.role !== 'MASTER';
  return {
    summary,
    canAnswerAll,
    reviews: rows.map((row) => ({
      ...toPublic(row),
      isFlagged: row.isFlagged,
      isHidden: row.isHidden,
      canAnswer: canAnswerAll || row.booking.staffId === me.id,
    })),
  };
}

/** Answers a review, or flags it for the platform. Neither takes it down. */
export async function actOnReview(
  user: User,
  shopId: string,
  reviewId: string,
  input: ReviewAction,
) {
  const me = await requireStaff(user.id, shopId);
  const review = await db.review.findFirst({
    where: { id: reviewId, shopId },
    select: { booking: { select: { staffId: true } } },
  });
  if (!review) throw new AppError('not_found', 'review not found');
  if (me.role === 'MASTER' && review.booking.staffId !== me.id) {
    throw new AppError('forbidden', 'not your review');
  }
  await db.$transaction([
    db.review.update({
      where: { id: reviewId },
      data:
        input.action === 'reply'
          ? { reply: input.reply, repliedAt: new Date() }
          : { isFlagged: true },
    }),
    db.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: `review.${input.action}`,
        entity: 'review',
        entityId: reviewId,
      },
    }),
  ]);
  return { id: reviewId };
}
