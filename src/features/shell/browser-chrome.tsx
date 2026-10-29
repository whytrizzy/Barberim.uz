'use client';

import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useTelegram } from '@/telegram/provider';
import { Button } from '@/ui/button';

/**
 * Outside Telegram there is no native Back/Main button, so these in-page stand-ins render the
 * same configs the pages give Telegram. Inside Telegram they render nothing.
 */
export function BrowserBackBar() {
  const { mode, browserBack } = useTelegram();
  const { t } = useI18n();
  if (mode !== 'browser' || !browserBack) return null;
  return (
    <div className="sticky top-0 z-10 bg-tile px-2 pt-2 pb-1">
      <Button variant="ghost" onClick={browserBack} className="gap-1.5 px-2">
        <ArrowLeft className="size-5" aria-hidden />
        {t.common.back}
      </Button>
    </div>
  );
}

export function BrowserMainBar() {
  const { mode, browserMain } = useTelegram();
  if (mode !== 'browser' || !browserMain) return null;
  return (
    <div className="sticky bottom-0 z-10 bg-tile px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <Button
        size="lg"
        block
        disabled={browserMain.disabled}
        loading={browserMain.loading}
        onClick={browserMain.onClick}
      >
        {browserMain.text}
      </Button>
    </div>
  );
}
