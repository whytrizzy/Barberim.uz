import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverEnv } from '@/env/server';
import { DesignShowcase } from './showcase';

export const metadata: Metadata = { title: 'Barberim — design system' };

/** Development-only preview of the design system with demo content. */
export default function DesignPage() {
  if (serverEnv.APP_ENV !== 'development') notFound();
  return <DesignShowcase />;
}
