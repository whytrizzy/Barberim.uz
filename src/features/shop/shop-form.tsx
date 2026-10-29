'use client';

import { Check, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { Coordinates } from '@/domain/places';
import { slugify } from '@/domain/slug';
import { clientEnv } from '@/env/client';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { interpolate } from '@/i18n/interpolate';
import { districtOptions, regionOptions } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { SectionLabel } from '@/ui/section-label';
import { Select } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { LocationField } from './location-field';
import {
  MAX_OWNED_SHOPS,
  shopDetailsSchema,
  type ShopDto,
  type UpdateShopRequest,
} from './schemas';
import { useCreateShop, useSlugCheck, useUpdateShop } from './use-shop';

type Field = 'name' | 'slug' | 'region' | 'district' | 'address' | 'landmark';

type ShopFormProps =
  | { mode: 'create'; onDone: (shop: ShopDto) => void }
  | { mode: 'edit'; shop: ShopDto; onDone: (shop: ShopDto) => void };

/** Opening a shop, or editing its details later: one form, Telegram's MainButton submits. */
export function ShopForm(props: ShopFormProps) {
  const { t, locale } = useI18n();
  const initial = props.mode === 'edit' ? props.shop : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(false);
  const [region, setRegion] = useState(initial?.region ?? 'tashkent-city');
  const [district, setDistrict] = useState(initial?.district ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [location, setLocation] = useState<Coordinates | null>(initial?.location ?? null);
  const [submitted, setSubmitted] = useState(false);

  const create = useCreateShop();
  const update = useUpdateShop(initial?.id ?? '');
  const mutation = props.mode === 'create' ? create : update;
  const slugCheck = useSlugCheck(slug, props.mode === 'create');

  const details: UpdateShopRequest = {
    name,
    region,
    district,
    address,
    landmark: landmark || undefined,
    location,
  };
  const parsed = shopDetailsSchema.safeParse(details);
  const fieldErrors = new Set<Field>(
    parsed.success ? [] : parsed.error.issues.map((i) => i.path[0] as Field),
  );

  const serverReason =
    mutation.error instanceof ApiError
      ? (mutation.error.details as { reason?: string } | undefined)?.reason
      : undefined;
  const slugProblem = serverReason === 'slug_taken' ? 'taken' : slugCheck.problem;
  const slugMessage =
    slugProblem === 'taken'
      ? t.shop.linkTaken
      : slugProblem === 'reserved'
        ? t.shop.linkReserved
        : slugProblem
          ? t.shop.linkFormat
          : null;

  const show = (field: Field) => submitted && fieldErrors.has(field);

  function submit() {
    setSubmitted(true);
    const slugOk = props.mode === 'edit' || (!slugProblem && !slugCheck.checking);
    if (!parsed.success || !slugOk) {
      haptic.notify('error');
      return;
    }
    if (props.mode === 'create') {
      create.mutate({ ...parsed.data, slug }, { onSuccess: props.onDone });
    } else {
      update.mutate(parsed.data, { onSuccess: props.onDone });
    }
  }

  useMainButton({
    text: props.mode === 'create' ? t.shop.create : t.shop.save,
    loading: mutation.isPending,
    onClick: submit,
  });

  const bot = clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot';
  const link = `t.me/${bot}?start=shop_${slug || '…'}`;
  const generalError =
    mutation.error && serverReason !== 'slug_taken'
      ? serverReason === 'too_many_shops'
        ? interpolate(t.shop.tooMany, { count: MAX_OWNED_SHOPS })
        : errorText(t, mutation.error)
      : null;

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
        label={t.shop.name}
        placeholder={t.shop.namePlaceholder}
        value={name}
        maxLength={60}
        autoComplete="organization"
        onChange={(e) => {
          setName(e.target.value);
          if (props.mode === 'create' && !slugEdited) setSlug(slugify(e.target.value));
        }}
        error={show('name') ? t.shop.required : null}
      />

      {props.mode === 'create' ? (
        <TextField
          label={t.shop.link}
          prefix="shop_"
          value={slug}
          maxLength={40}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
          }}
          error={slug && slugMessage ? slugMessage : submitted && !slug ? t.shop.required : null}
          hint={
            slug && !slugMessage ? (
              <span className="flex flex-wrap items-center gap-x-1.5">
                {slugCheck.checking ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <span className="flex items-center gap-1 text-success">
                    <Check className="size-3.5" aria-hidden />
                    {t.shop.linkFree}
                  </span>
                )}
                <span className="break-all">· {interpolate(t.shop.linkHint, { link })}</span>
              </span>
            ) : null
          }
        />
      ) : (
        <p className="text-sm break-all text-ink-muted">{interpolate(t.shop.linkHint, { link })}</p>
      )}

      <SectionLabel className="mt-2 mb-0">{t.shop.address}</SectionLabel>
      <Select
        label={t.shop.region}
        options={regionOptions(locale)}
        value={region}
        onChange={(e) => {
          setRegion(e.target.value);
          setDistrict('');
        }}
      />
      {region === 'tashkent-city' ? (
        <Select
          label={t.shop.district}
          placeholder={t.shop.districtPlaceholder}
          options={districtOptions(locale)}
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          error={show('district') ? t.shop.required : null}
        />
      ) : (
        <TextField
          label={t.shop.districtFree}
          value={district}
          maxLength={60}
          onChange={(e) => setDistrict(e.target.value)}
          error={show('district') ? t.shop.required : null}
        />
      )}
      <TextField
        label={t.shop.address}
        placeholder={t.shop.addressPlaceholder}
        value={address}
        maxLength={200}
        autoComplete="street-address"
        onChange={(e) => setAddress(e.target.value)}
        error={show('address') ? t.shop.required : null}
      />
      <TextField
        label={t.shop.landmark}
        placeholder={t.shop.landmarkPlaceholder}
        value={landmark}
        maxLength={120}
        onChange={(e) => setLandmark(e.target.value)}
        hint={t.shop.landmarkHint}
      />

      <SectionLabel className="mt-2 mb-0">{t.shop.location}</SectionLabel>
      <LocationField value={location} onChange={setLocation} />

      {generalError && (
        <p role="alert" className="text-sm text-enamel-text">
          {generalError}
        </p>
      )}
      {/* Lets Enter submit in browsers; in Telegram the MainButton is the submit control. */}
      <button type="submit" hidden />
    </form>
  );
}
