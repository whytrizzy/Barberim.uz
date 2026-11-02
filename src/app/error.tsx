'use client';

import { useEffect } from 'react';
import { LoadError } from '@/features/api/load-states';
import { useI18n } from '@/i18n/provider';
import { EnamelSign } from '@/ui/enamel-sign';

/** Anything a screen didn't expect: in the person's language, with a way back in. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error('screen crashed', error.message);
  }, [error]);
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4">
      <EnamelSign overline="Sartaroshxona">Barberim</EnamelSign>
      <LoadError className="mt-5" message={t.common.somethingWrong} onRetry={reset} />
    </main>
  );
}
