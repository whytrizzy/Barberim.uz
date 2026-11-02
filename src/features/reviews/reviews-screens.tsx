'use client';

import { Flag } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { formatDayMonth } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import type { PublicReviewDto, RatingSummary, StaffReviewDto } from './schemas';
import { formatAverage, StarPicker, Stars } from './stars';
import { useCreateReview, useMyReview, useReviewAction, useShopReviews } from './use-reviews';

function reviewError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'already_reviewed') return t.reviews.alreadyReviewed;
    if (reason === 'not_completed') return t.reviews.notCompleted;
  }
  return errorText(t, error);
}

export function RatingLine({ summary }: { summary: RatingSummary }) {
  const { t } = useI18n();
  if (summary.average === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="font-semibold">{formatAverage(summary.average)}</span>
      <Stars rating={Math.round(summary.average)} />
      <span className="text-ink-muted">
        {interpolate(t.reviews.count, { count: summary.count })}
      </span>
    </span>
  );
}

/** One review on the shop's page, with the shop's answer if there is one. */
export function ReviewCard({ review, shopName }: { review: PublicReviewDto; shopName?: string }) {
  const { t, locale } = useI18n();
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[15px] font-semibold">
          {typedText(review.clientName, locale)}
        </span>
        <Stars rating={review.rating} className="shrink-0" />
      </div>
      <p className="text-xs text-ink-muted">
        {formatDayMonth(new Date(review.createdAt), locale)} ·{' '}
        {interpolate(t.agenda.withMaster, { name: typedText(review.masterName, locale) })}
      </p>
      {review.comment && <p className="text-[15px] whitespace-pre-wrap">{review.comment}</p>}
      {review.reply && (
        <p className="mt-1 rounded-[5px] bg-porcelain-sunk px-2.5 py-2 text-sm whitespace-pre-wrap">
          <span className="font-semibold">{shopName ?? t.reviews.shopReply}: </span>
          {review.reply}
        </p>
      )}
    </div>
  );
}

/** On a finished booking: leave a review, or read the one you left. */
export function BookingReview({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const query = useMyReview(bookingId, true);
  const create = useCreateReview(bookingId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (query.isPending) return null;
  if (query.isError) {
    return <LoadError className="mt-5" error={query.error} onRetry={() => void query.refetch()} />;
  }

  const mine = query.data.review;
  if (mine) {
    return (
      <section className="mt-5">
        <SectionLabel className="mt-0">{t.reviews.yourReview}</SectionLabel>
        <div className="grid gap-1 rounded-tile border border-chrome bg-porcelain p-3">
          <Stars rating={mine.rating} />
          {mine.comment && <p className="text-[15px] whitespace-pre-wrap">{mine.comment}</p>}
          {mine.reply && (
            <p className="mt-1 rounded-[5px] bg-porcelain-sunk px-2.5 py-2 text-sm whitespace-pre-wrap">
              <span className="font-semibold">{t.reviews.shopReply}: </span>
              {mine.reply}
            </p>
          )}
        </div>
      </section>
    );
  }

  function submit() {
    setSubmitted(true);
    if (rating === 0) {
      haptic.notify('error');
      return;
    }
    create.mutate(
      { rating, comment: comment.trim() || undefined },
      {
        onSuccess: () => haptic.notify('success'),
        onError: () => haptic.notify('error'),
      },
    );
  }

  return (
    <section className="mt-5 grid gap-3">
      <div>
        <SectionLabel className="mt-0">{t.reviews.askTitle}</SectionLabel>
        <p className="text-sm text-ink-muted">{t.reviews.askHint}</p>
      </div>
      <StarPicker value={rating} onChange={setRating} />
      {submitted && rating === 0 && (
        <p role="alert" className="text-sm text-enamel-text">
          {t.reviews.pickRating}
        </p>
      )}
      <TextField
        label={t.reviews.comment}
        placeholder={t.agenda.clientOptional}
        value={comment}
        maxLength={1000}
        autoComplete="off"
        onChange={(e) => setComment(e.target.value)}
      />
      <Button loading={create.isPending} onClick={submit}>
        {t.reviews.send}
      </Button>
      {create.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {reviewError(t, create.error)}
        </p>
      )}
    </section>
  );
}

function StaffReviewRow({ shopId, review }: { shopId: string; review: StaffReviewDto }) {
  const { t } = useI18n();
  const action = useReviewAction(shopId, review.id);
  const [answering, setAnswering] = useState(false);
  const [reply, setReply] = useState(review.reply ?? '');

  async function flag() {
    if (!(await confirmAction(t.reviews.flagConfirm))) return;
    action.mutate({ action: 'flag' }, { onSuccess: () => haptic.notify('success') });
  }

  return (
    <li className="grid gap-2 bg-porcelain p-3">
      <ReviewCard review={review} />
      {review.isHidden && <p className="text-sm text-ink-muted">{t.reviews.hidden}</p>}
      {review.isFlagged && !review.isHidden && (
        <p className="text-sm text-ink-muted">{t.reviews.flagged}</p>
      )}
      {review.canAnswer &&
        (answering ? (
          <div className="grid gap-2">
            <TextField
              label={t.reviews.replyLabel}
              value={reply}
              maxLength={1000}
              autoComplete="off"
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                loading={action.isPending}
                disabled={!reply.trim()}
                onClick={() =>
                  action.mutate(
                    { action: 'reply', reply },
                    {
                      onSuccess: () => {
                        haptic.notify('success');
                        setAnswering(false);
                      },
                    },
                  )
                }
              >
                {t.common.save}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setAnswering(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setAnswering(true)}>
              {review.reply ? t.reviews.editReply : t.reviews.reply}
            </Button>
            {!review.isFlagged && (
              <Button variant="ghost" disabled={action.isPending} onClick={() => void flag()}>
                <Flag className="size-4" aria-hidden />
                {t.reviews.flag}
              </Button>
            )}
          </div>
        ))}
      {action.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {errorText(t, action.error)}
        </p>
      )}
    </li>
  );
}

/** /staff/shop/:id/reviews */
export function StaffReviewsScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const query = useShopReviews(shopId);
  // A screen with no next step of its own; make sure a previous screen's button doesn't linger.
  useMainButton(null);

  if (query.isPending) return <ScreenLoading />;
  if (query.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const { summary, reviews } = query.data;
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="font-sign text-[30px] leading-none font-bold uppercase">{t.reviews.title}</h1>
      <p className="mt-2 text-sm">
        <RatingLine summary={summary} />
      </p>
      {reviews.length === 0 ? (
        <p className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {t.reviews.empty}
        </p>
      ) : (
        <ul className="mt-4 grid gap-px overflow-hidden rounded-tile border border-chrome bg-chrome">
          {reviews.map((review) => (
            <StaffReviewRow key={review.id} shopId={shopId} review={review} />
          ))}
        </ul>
      )}
    </main>
  );
}
