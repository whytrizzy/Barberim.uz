import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A checkbox in the app's own look; goes inside the label it belongs to. */
export function Tick({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span
        aria-hidden
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-[5px] border border-chrome bg-porcelain transition-colors duration-150 ease-snappy',
          checked && 'border-pick bg-pick text-on-pick',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </>
  );
}
