import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A vertical column of tiles joined by grout — bookings, services, clients. */
export function TileList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul
      className={cn(
        'grid gap-px overflow-hidden rounded-tile border border-chrome bg-chrome',
        className,
      )}
    >
      {children}
    </ul>
  );
}

type TileRowProps = {
  /** Left column, usually a time. */
  lead?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** Right column, usually a price or an action. */
  trail?: ReactNode;
  /** `current` puts the lead on a red tile (the client in the chair now). */
  state?: 'default' | 'current' | 'free' | 'break';
  className?: string;
};

export function TileRow({
  lead,
  title,
  detail,
  trail,
  state = 'default',
  className,
}: TileRowProps) {
  return (
    <li
      className={cn(
        'grid grid-cols-[3.5rem_1fr_auto] items-center gap-2.5 bg-porcelain px-3 py-2.5',
        state === 'free' && 'bg-porcelain-sunk',
        state === 'break' &&
          'bg-[repeating-linear-gradient(135deg,var(--porcelain-sunk)_0_8px,var(--porcelain)_8px_16px)]',
        className,
      )}
    >
      <span
        className={cn(
          'font-semibold tabular-nums',
          state === 'current' && 'rounded-[5px] bg-enamel py-0.5 text-center text-on-enamel',
        )}
      >
        {lead}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            'truncate text-[15px] leading-tight font-semibold',
            (state === 'free' || state === 'break') && 'font-normal text-ink-muted',
          )}
        >
          {title}
        </div>
        {detail && <div className="truncate text-xs text-ink-muted">{detail}</div>}
      </div>
      <div className="text-[13px] font-semibold tabular-nums">{trail}</div>
    </li>
  );
}
