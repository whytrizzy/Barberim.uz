import type { Metadata } from 'next';
import { BookScreen } from '@/features/booking/book-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string; start?: string }>;
}) {
  const { slug } = await params;
  const { service, start } = await searchParams;
  const startMin = start === undefined ? NaN : Number(start);
  return (
    <BookScreen
      slug={slug}
      initialService={service}
      initialStart={Number.isInteger(startMin) ? startMin : undefined}
    />
  );
}
