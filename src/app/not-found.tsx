'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { EnamelSign } from '@/ui/enamel-sign';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4">
      <EnamelSign overline="Sartaroshxona">Barberim</EnamelSign>
      <p className="mt-5 text-[15px]">{t.errors.pageNotFound}</p>
      <Link
        href="/"
        className="mt-2 flex min-h-11 items-center text-sm font-semibold text-enamel-text"
      >
        {t.common.goHome}
      </Link>
    </main>
  );
}
