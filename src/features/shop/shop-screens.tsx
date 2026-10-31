'use client';

import { ChevronRight, CircleCheck, Scissors } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorText } from '@/features/api/error-text';
import { useI18n } from '@/i18n/provider';
import { EnamelSign } from '@/ui/enamel-sign';
import { ShopForm } from './shop-form';
import { ShopPhotos } from './shop-photos';
import { useShop } from './use-shop';

/** /staff/new — open a shop. */
export function ShopCreateScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="font-sign text-[30px] leading-none font-bold uppercase">
        {t.shop.createTitle}
      </h1>
      <p className="mt-2 mb-5 text-sm text-ink-muted">{t.shop.createIntro}</p>
      <ShopForm
        mode="create"
        onDone={(shop) => router.replace(`/staff/shop/${shop.id}?created=1`)}
      />
    </main>
  );
}

/** /staff/shop/:id — the shop's details, editable by owners and admins. */
export function ShopEditScreen({ shopId, justCreated }: { shopId: string; justCreated: boolean }) {
  const { t } = useI18n();
  const shop = useShop(shopId);
  const [saved, setSaved] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  if (shop.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (shop.isError) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {errorText(t, shop.error)}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.shop.editTitle}>{shop.data.name}</EnamelSign>
      {shop.data.status === 'DRAFT' && (
        <p className="mt-2 text-sm text-ink-muted">{t.shop.draft}</p>
      )}
      {(justCreated || saved) && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {saved ? t.shop.saved : t.shop.created}
        </p>
      )}
      <Link
        href={`/staff/shop/${shopId}/services`}
        className="mt-5 flex items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-3 active:bg-porcelain-sunk"
      >
        <Scissors className="size-5 shrink-0 text-enamel-text" aria-hidden />
        <span className="flex-1 text-[15px] font-semibold">{t.services.title}</span>
        <ChevronRight className="size-5 text-ink-muted" aria-hidden />
      </Link>
      <div className="mt-5">
        <ShopPhotos shopId={shopId} photos={shop.data.photos} />
      </div>
      <div className="mt-6">
        <ShopForm
          // Remount with the saved values after a save — but not when only the photos changed,
          // which would throw away details being typed.
          key={formVersion}
          mode="edit"
          shop={shop.data}
          onDone={() => {
            setSaved(true);
            setFormVersion((n) => n + 1);
          }}
        />
      </div>
    </main>
  );
}
