import { z } from 'zod';

/** POST /api/me/bookings/:id/review */
export const reviewRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** PATCH /api/shops/:id/reviews/:reviewId — answer it, or ask the platform to look at it. */
export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), reply: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal('flag') }),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

/** What anyone can read. Only a first name, since it's public. */
export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  reply: z.string().nullable(),
  clientName: z.string(),
  masterName: z.string(),
  createdAt: z.string(),
});
export type PublicReviewDto = z.infer<typeof publicReviewSchema>;

export const ratingSummarySchema = z.object({
  average: z.number().nullable(),
  count: z.number(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

/** A client's own review, on their booking. */
export const myReviewSchema = z.object({
  rating: z.number(),
  comment: z.string().nullable(),
  reply: z.string().nullable(),
});

/** GET /api/me/bookings/:id/review */
export const myReviewResponseSchema = z.object({ review: myReviewSchema.nullable() });

/** GET /api/shops/:id/reviews */
export const staffReviewsSchema = z.object({
  summary: ratingSummarySchema,
  canAnswerAll: z.boolean(),
  reviews: z.array(
    publicReviewSchema.extend({
      isFlagged: z.boolean(),
      isHidden: z.boolean(),
      /** Owners and admins answer any review; a master, those about their own work. */
      canAnswer: z.boolean(),
    }),
  ),
});
export type StaffReviewsDto = z.infer<typeof staffReviewsSchema>;
export type StaffReviewDto = StaffReviewsDto['reviews'][number];

/** `details.reason` when a review is refused. */
export type ReviewRefusal = 'not_completed' | 'already_reviewed';
