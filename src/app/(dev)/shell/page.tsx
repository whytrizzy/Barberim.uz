import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevelopment } from '@/env/server';
import { ShellCheck } from './shell-check';

export const metadata: Metadata = { title: 'Barberim — Telegram shell check' };

/** Development-only page to check the Telegram integration (open it from the dev bot). */
export default function ShellPage() {
  if (!isDevelopment) notFound();
  return <ShellCheck />;
}
