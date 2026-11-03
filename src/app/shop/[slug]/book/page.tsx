import type { Metadata } from 'next';
import { BookScreen } from '@/features/booking/book-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `service` (one, from the shop page) or `services` and `master` (booking the same again). */
  searchParams: Promise<{ service?: string; services?: string; master?: string; start?: string }>;
}) {
  const { slug } = await params;
  const { service, services, master, start } = await searchParams;
  const startMin = start === undefined ? NaN : Number(start);
  // Unknown ids are harmless: the screen only picks what the shop actually offers.
  const serviceIds = (services ?? service ?? '').split(',').filter(Boolean).slice(0, 10);
  return (
    <BookScreen
      slug={slug}
      initialServices={serviceIds}
      initialMaster={master}
      initialStart={Number.isInteger(startMin) ? startMin : undefined}
    />
  );
}
