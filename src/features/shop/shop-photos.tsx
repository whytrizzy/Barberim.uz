'use client';

import { useI18n } from '@/i18n/provider';
import { PhotoGrid } from './photo-grid';
import { MAX_SHOP_PHOTOS, type ShopPhoto } from './schemas';
import { useShopPhotos } from './use-shop';

/** The shop's photos on its edit screen; the first one is the cover. */
export function ShopPhotos({ shopId, photos }: { shopId: string; photos: ShopPhoto[] }) {
  const { t } = useI18n();
  return (
    <PhotoGrid
      photos={photos}
      max={MAX_SHOP_PHOTOS}
      title={t.shop.photos}
      hint={t.shop.photosHint}
      cover
      actions={useShopPhotos(shopId)}
    />
  );
}
