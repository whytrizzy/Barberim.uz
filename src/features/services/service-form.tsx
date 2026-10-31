'use client';

import { Check, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { formatDuration, groupDigits } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { Select } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { TileList } from '@/ui/tile-list';
import {
  MAX_SERVICE_MINUTES,
  MAX_SHOP_SERVICES,
  MIN_SERVICE_MINUTES,
  SERVICE_CATEGORIES,
  serviceRequestSchema,
  type ServiceCategory,
  type ServiceDto,
  type ShopServicesDto,
} from './schemas';
import { useServiceActions } from './use-services';

/** Every 5 minutes up to 4 hours, then hourly: long enough for wedding packages. */
function durationChoices(current: number): number[] {
  const choices = new Set<number>([current]);
  for (let m = MIN_SERVICE_MINUTES; m <= 240; m += 5) choices.add(m);
  for (let m = 300; m <= MAX_SERVICE_MINUTES; m += 60) choices.add(m);
  return [...choices].sort((a, b) => a - b);
}

/** A checkbox in the app's own look; goes inside the label it belongs to. */
function Tick({ checked, onChange }: { checked: boolean; onChange: () => void }) {
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

type ServiceFormProps = {
  shopId: string;
  /** Null when adding a new service. */
  service: ServiceDto | null;
  masters: ShopServicesDto['masters'];
};

/** Adding or editing a service; Telegram's MainButton saves. */
export function ServiceForm({ shopId, service, masters }: ServiceFormProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(service?.name ?? '');
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? 'ADULT');
  const [durationMin, setDurationMin] = useState(service?.durationMin ?? 30);
  const [price, setPrice] = useState(service ? String(service.price) : '');
  const [priceIsFrom, setPriceIsFrom] = useState(service?.priceIsFrom ?? false);
  // A new service starts with everyone: most shops' masters all cut hair.
  const [staffIds, setStaffIds] = useState(service?.staffIds ?? masters.map((m) => m.id));
  const [submitted, setSubmitted] = useState(false);
  const { save, remove } = useServiceActions(shopId, service?.id ?? null);

  const parsed = serviceRequestSchema.safeParse({
    name,
    category,
    durationMin,
    price: price === '' ? null : Number(price),
    priceIsFrom,
    staffIds,
  });
  const invalid = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path[0]));
  const show = (field: string) => submitted && invalid.has(field);

  function submit() {
    setSubmitted(true);
    if (!parsed.success) {
      haptic.notify('error');
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        haptic.notify('success');
        router.back();
      },
      onError: () => haptic.notify('error'),
    });
  }

  async function removeService() {
    if (!service || !(await confirmAction(t.services.deleteConfirm))) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        haptic.notify('success');
        router.back();
      },
      onError: () => haptic.notify('error'),
    });
  }

  useMainButton({
    text: t.common.save,
    loading: save.isPending,
    disabled: remove.isPending,
    onClick: submit,
  });

  const failure = save.error ?? remove.error;
  const reason =
    failure instanceof ApiError
      ? (failure.details as { reason?: string } | undefined)?.reason
      : undefined;
  const failureText = !failure
    ? null
    : reason === 'too_many_services'
      ? interpolate(t.services.tooMany, { count: MAX_SHOP_SERVICES })
      : reason === 'unknown_master'
        ? t.services.masterGone
        : errorText(t, failure);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField
        label={t.services.name}
        placeholder={t.services.namePlaceholder}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        error={show('name') ? t.services.nameRequired : null}
      />
      <Select
        label={t.services.category}
        options={SERVICE_CATEGORIES.map((value) => ({
          value,
          label: t.services.categories[value],
        }))}
        value={category}
        onChange={(e) => setCategory(e.target.value as ServiceCategory)}
      />
      <Select
        label={t.services.duration}
        options={durationChoices(durationMin).map((minutes) => ({
          value: String(minutes),
          label: formatDuration(minutes, locale),
        }))}
        value={String(durationMin)}
        onChange={(e) => setDurationMin(Number(e.target.value))}
      />
      <div>
        <TextField
          label={`${t.services.price}, ${t.units.currency}`}
          placeholder="60 000"
          inputMode="numeric"
          autoComplete="off"
          value={price === '' ? '' : groupDigits(Number(price))}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 9))}
          error={show('price') ? t.services.priceInvalid : null}
        />
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-tile text-[15px] has-focus-visible:ring-2 has-focus-visible:ring-pick">
          <Tick
            checked={priceIsFrom}
            onChange={() => {
              haptic.selection();
              setPriceIsFrom(!priceIsFrom);
            }}
          />
          {t.services.priceFrom}
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t.services.masters}</legend>
        <TileList>
          {masters.map((master) => {
            const checked = staffIds.includes(master.id);
            return (
              <li key={master.id} className="bg-porcelain">
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 has-focus-visible:ring-2 has-focus-visible:ring-pick has-focus-visible:ring-inset">
                  <Tick
                    checked={checked}
                    onChange={() => {
                      haptic.selection();
                      setStaffIds((ids) =>
                        checked ? ids.filter((id) => id !== master.id) : [...ids, master.id],
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {master.name}
                  </span>
                </label>
              </li>
            );
          })}
        </TileList>
        {show('staffIds') && (
          <p role="alert" className="mt-1.5 text-sm text-enamel-text">
            {t.services.mastersRequired}
          </p>
        )}
      </fieldset>

      {failureText && (
        <p role="alert" className="text-sm text-enamel-text">
          {failureText}
        </p>
      )}

      {service && (
        <Button
          variant="ghost"
          className="justify-self-start px-2"
          loading={remove.isPending}
          disabled={save.isPending}
          onClick={() => void removeService()}
        >
          {!remove.isPending && <Trash2 className="size-4" aria-hidden />}
          {t.services.delete}
        </Button>
      )}
      {/* Lets Enter submit in browsers; in Telegram the MainButton is the submit control. */}
      <button type="submit" hidden />
    </form>
  );
}
