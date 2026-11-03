import type { Metadata } from 'next';
import { BookScreen } from '@/features/booking/book-screen';

export const metadata: Metadata = { title: 'Barberim' };

type Query = {
  service?: string;
  services?: string;
  master?: string;
  date?: string;
  start?: string;
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /**
   * `service` (one, from the shop page), `services` and `master` (booking the same again), and
   * `date` (a waitlist message about that day).
   */
  searchParams: Promise<Query>;
}) {
  const { slug } = await params;
  const { service, services, master, date, start } = await searchParams;
  const startMin = start === undefined ? NaN : Number(start);
  // Unknown ids are harmless: the screen only picks what the shop actually offers.
  const serviceIds = (services ?? service ?? '').split(',').filter(Boolean).slice(0, 10);
  return (
    <BookScreen
      slug={slug}
      initialServices={serviceIds}
      initialMaster={master}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
      initialStart={Number.isInteger(startMin) ? startMin : undefined}
    />
  );
}
