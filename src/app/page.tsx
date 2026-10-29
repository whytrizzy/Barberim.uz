import Link from 'next/link';
import { isDevelopment } from '@/env/server';
import { EnamelSign } from '@/ui/enamel-sign';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4">
      <EnamelSign overline="Sartaroshxona">Barberim</EnamelSign>
      {isDevelopment && (
        <nav className="mt-6 grid gap-2 text-sm">
          <Link href="/design" className="font-semibold text-enamel-text">
            Design system →
          </Link>
          <Link href="/shell" className="font-semibold text-enamel-text">
            Telegram shell check →
          </Link>
        </nav>
      )}
    </main>
  );
}
