import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type TileGroupProps = {
  /** Accessible name of the choice, e.g. "Boʻsh vaqtlar". */
  label: string;
  columns: 3 | 4 | 6 | 7;
  children: ReactNode;
  className?: string;
};

const columnClass = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
} as const;

/**
 * Porcelain tiles joined by 1px chrome grout — the shape of every single choice in the app
 * (master, day, free time). Behaves as a radio group.
 */
export function TileGroup({ label, columns, children, className }: TileGroupProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid gap-px overflow-hidden rounded-tile border border-chrome bg-chrome',
        columnClass[columns],
        className,
      )}
    >
      {children}
    </div>
  );
}

type TileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role'> & {
  selected?: boolean;
  /** Red for the final choice (time), green `pick` for choices on the way (master, day). */
  tone?: 'enamel' | 'pick';
  /** Not available, e.g. an already-booked time. */
  unavailable?: boolean;
};

export function Tile({
  selected = false,
  tone = 'pick',
  unavailable = false,
  className,
  children,
  ...props
}: TileProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={unavailable || props.disabled}
      className={cn(
        'flex min-h-12 flex-col items-center justify-center bg-porcelain px-1 py-2 text-ink',
        'transition-colors duration-150 ease-snappy active:bg-porcelain-sunk',
        unavailable && 'bg-porcelain-sunk font-normal text-ink-faint line-through',
        selected && tone === 'enamel' && 'bg-enamel text-on-enamel active:bg-enamel-strong',
        selected && tone === 'pick' && 'bg-pick text-on-pick active:bg-pick',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
