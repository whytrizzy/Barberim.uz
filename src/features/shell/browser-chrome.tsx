'use client';

import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/telegram/provider';
import { Button } from '@/ui/button';

/**
 * Outside Telegram there is no native Back/Main button, so these in-page stand-ins render the
 * same configs the pages give Telegram. Inside Telegram they render nothing.
 */
export function BrowserBackBar() {
  const { mode, browserBack } = useTelegram();
  if (mode !== 'browser' || !browserBack) return null;
  return (
    <div className="sticky top-0 z-10 px-2 pt-2">
      <Button variant="ghost" onClick={browserBack} className="gap-1.5 px-2" aria-label="Orqaga">
        <ArrowLeft className="size-5" aria-hidden />
        Orqaga
      </Button>
    </div>
  );
}

export function BrowserMainBar() {
  const { mode, browserMain } = useTelegram();
  if (mode !== 'browser' || !browserMain) return null;
  return (
    <div className="sticky bottom-0 z-10 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
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
