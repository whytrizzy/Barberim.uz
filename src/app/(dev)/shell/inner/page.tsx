import { notFound } from 'next/navigation';
import { isDevelopment } from '@/env/server';

/** Development-only: a nested page so the Back button can be checked. */
export default function ShellInnerPage() {
  if (!isDevelopment) notFound();
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4">
      <h1 className="font-sign text-[34px] leading-none font-bold uppercase">Ichki sahifa</h1>
      <p className="mt-2 text-ink-muted">
        Yuqoridagi “Orqaga” tugmasi oldingi sahifaga qaytaradi. Asosiy tugma bu yerda yashirin.
      </p>
    </main>
  );
}
