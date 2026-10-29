import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Small condensed-capitals heading above a tile group, like lettering on a shop wall. */
export function SectionLabel({
  children,
  as: Tag = 'h2',
  className,
}: {
  children: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'mt-5 mb-2 font-sign text-[13px] font-bold tracking-[0.08em] text-ink-muted uppercase',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
