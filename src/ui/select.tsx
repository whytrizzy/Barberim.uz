import { ChevronDown } from 'lucide-react';
import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  label: string;
  options: { value: string; label: string }[];
  /** Shown as a disabled first option when nothing is chosen yet. */
  placeholder?: string;
  error?: string | null;
};

/** The platform's own picker (best on cheap Android phones), dressed as a porcelain tile. */
export function Select({
  label,
  options,
  placeholder,
  error,
  className,
  id,
  ...select
}: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-12 w-full appearance-none rounded-tile border border-chrome bg-porcelain pr-10 pl-3 text-base font-semibold',
            'focus:border-enamel focus:ring-2 focus:ring-enamel/25 focus:outline-none',
            !select.value && 'font-normal text-ink-faint',
            error && 'border-enamel',
          )}
          {...select}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-enamel-text">
          {error}
        </p>
      )}
    </div>
  );
}
