'use client';

import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { PhotoGrid } from '@/features/shop/photo-grid';
import { useI18n } from '@/i18n/provider';
import { useMainButton } from '@/telegram/use-main-button';
import { MAX_PORTFOLIO_PHOTOS } from './schemas';
import { usePortfolio, usePortfolioPhotos } from './use-portfolio';

/** /staff/shop/:id/team/:staffId/portfolio */
export function PortfolioScreen({ shopId, staffId }: { shopId: string; staffId: string }) {
  const { t } = useI18n();
  const query = usePortfolio(shopId, staffId);
  const actions = usePortfolioPhotos(shopId, staffId);
  // Every change saves itself; make sure a previous screen's button doesn't linger.
  useMainButton(null);

  if (query.isPending) return <ScreenLoading />;
  if (query.isError || !query.data.canEdit) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        message={query.isError ? undefined : t.portfolio.notFound}
        error={query.error}
        onRetry={query.isError ? () => void query.refetch() : undefined}
      />
    );
  }
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-5 font-sign text-[30px] leading-none font-bold uppercase">
        {query.data.name}
      </h1>
      <PhotoGrid
        photos={query.data.photos}
        max={MAX_PORTFOLIO_PHOTOS}
        title={t.portfolio.title}
        hint={t.portfolio.hint}
        actions={actions}
      />
    </main>
  );
}
