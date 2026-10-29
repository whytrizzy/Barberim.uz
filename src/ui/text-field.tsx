import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/cn';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  ref?: Ref<HTMLInputElement>;
  label: string;
  /** Fixed text inside the field before the input, e.g. "+998". */
  prefix?: ReactNode;
  hint?: ReactNode;
  /** Shown instead of the hint, in enamel with an alert role. */
  error?: ReactNode;
};

/** A porcelain tile with a label above it; focus and error use the enamel accent. */
export function TextField({ label, prefix, hint, error, className, id, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const noteId = `${fieldId}-note`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center rounded-tile border border-chrome bg-porcelain px-3',
          'focus-within:border-enamel focus-within:ring-2 focus-within:ring-enamel/25',
          error && 'border-enamel',
        )}
      >
        {prefix && (
          <span className="mr-2 font-semibold text-ink-muted tabular-nums" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-ink-faint"
          {...input}
        />
      </div>
      {(error || hint) && (
        <p
          id={noteId}
          role={error ? 'alert' : undefined}
          className={cn('mt-1.5 text-sm', error ? 'text-enamel-text' : 'text-ink-muted')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
