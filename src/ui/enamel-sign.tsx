import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EnamelSignProps = {
  /** Small line above the name, e.g. "SARTAROSHXONA". */
  overline?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** The shop's name on a red enamel sign — the signature element of the Sartaroshxona world. */
export function EnamelSign({ overline, children, className }: EnamelSignProps) {
  return (
    <div
      className={cn(
        'relative rounded-sign bg-enamel px-3.5 pt-3 pb-2.5 text-on-enamel',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_6px_14px_-8px_rgb(80_0_10/0.6)]',
        // Inner white keyline, like the rim of a pressed-steel sign.
        'after:pointer-events-none after:absolute after:inset-1 after:rounded-[3px] after:border after:border-white/55',
        className,
      )}
    >
      {overline && (
        <p className="font-sign text-[11px] font-bold tracking-[0.14em] uppercase opacity-85">
          {overline}
        </p>
      )}
      <h1 className="mt-0.5 font-sign text-[30px] leading-none font-bold tracking-[0.02em] uppercase">
        {children}
      </h1>
    </div>
  );
}
