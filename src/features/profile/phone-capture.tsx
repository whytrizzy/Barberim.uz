'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatNationalDigits, formatUzPhone, nationalDigits } from '@/domain/phone';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { useI18n } from '@/i18n/provider';
import { useTelegram } from '@/telegram/provider';
import { canRequestContact, requestContact } from '@/telegram/request-contact';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import type { PhoneRejection } from './schemas';
import { useSavePhone } from './use-save-phone';

type PhoneCaptureProps = {
  phone: string | null;
  phoneVerified: boolean;
};

/**
 * Asks for the user's phone: one tap through Telegram's verified contact sharing when running in
 * Telegram, or typed into a +998 field. Shows the saved number with a "change" action afterwards.
 */
export function PhoneCapture({ phone, phoneVerified }: PhoneCaptureProps) {
  const { t } = useI18n();
  const { mode } = useTelegram();
  const queryClient = useQueryClient();
  const save = useSavePhone();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!phone);
  const [digits, setDigits] = useState('');
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // `mode` is "loading" on the server and first render, so this never mismatches on hydration.
  const telegramShare = mode === 'telegram' && canRequestContact();

  const errorMessage = (() => {
    if (!save.error) return null;
    const reason = (save.error as ApiError).details as { reason?: PhoneRejection } | undefined;
    if (save.error instanceof ApiError && save.error.code === 'invalid_input') {
      if (reason?.reason === 'phone_not_uz') return t.profile.phoneNotUz;
      if (reason?.reason === 'phone_invalid') return t.profile.phoneInvalid;
    }
    return errorText(t, save.error);
  })();

  async function shareViaTelegram() {
    setNote(null);
    setSharing(true);
    const result = await requestContact();
    setSharing(false);
    if (result.status === 'shared' && result.signed) {
      save.mutate(
        { source: 'telegram', contact: result.signed },
        { onSuccess: () => setEditing(false) },
      );
    } else if (result.status === 'shared') {
      // Telegram also delivers the contact to the bot, which saves it; pick it up shortly.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['session'] }), 1500);
      setEditing(false);
    } else if (result.status === 'declined') {
      setNote(t.profile.declined);
      inputRef.current?.focus();
    }
  }

  function saveManual() {
    setNote(null);
    save.mutate(
      { source: 'manual', phone: `+998${digits}` },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (phone && !editing) {
    return (
      <div className="flex items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-semibold tabular-nums">{formatUzPhone(phone)}</p>
          {phoneVerified && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
              {t.profile.verified}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setDigits(nationalDigits(phone));
            setEditing(true);
          }}
        >
          {t.profile.change}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-muted">{t.profile.phoneHint}</p>

      {telegramShare && (
        <>
          <Button variant="secondary" block size="lg" loading={sharing} onClick={shareViaTelegram}>
            <Send className="size-4" aria-hidden />
            {sharing ? t.profile.sharing : t.profile.shareTelegram}
          </Button>
          <p className="text-center text-xs text-ink-muted">{t.profile.orManual}</p>
        </>
      )}

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (digits.length === 9) saveManual();
        }}
      >
        <TextField
          ref={inputRef}
          label={t.profile.phoneLabel}
          prefix="+998"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="90 123 45 67"
          value={formatNationalDigits(digits)}
          onChange={(event) => setDigits(nationalDigits(event.target.value))}
          error={errorMessage}
          hint={note}
        />
        <Button type="submit" block disabled={digits.length !== 9} loading={save.isPending}>
          {t.profile.save}
        </Button>
      </form>
    </div>
  );
}
