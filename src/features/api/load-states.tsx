'use client';

import { RotateCw } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/button';
import { errorText } from './error-text';

/** The shape of a screen while its data is on the way, so a slow connection doesn't look broken. */
export function ScreenLoading({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div role="status" className={cn('mx-auto grid max-w-[390px] gap-2 px-4 pt-6', className)}>
      <span className="sr-only">{t.common.loading}</span>
      <div
        aria-hidden
        className="h-8 w-2/3 rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
      />
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-14 rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

/**
 * A load that failed: says what happened and offers another try, so a dropped connection on the
 * road isn't a dead end. Leave out `onRetry` where trying again can't help (a missing page).
 */
export function LoadError({
  error,
  message,
  onRetry,
  className,
}: {
  error?: unknown;
  /** Instead of the usual sentence for this error. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('grid justify-items-start gap-2', className)}>
      <p role="alert" className="text-sm text-enamel-text">
        {message ?? errorText(t, error)}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden />
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}
