'use client';

import { Download, Send } from 'lucide-react';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { interpolate } from '@/i18n/interpolate';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { downloadFile, shareViaTelegram, shopBotLink } from '@/telegram/links';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { useShop } from './use-shop';

type Kind = 'story' | 'poster' | 'qr';

function Picture({
  slug,
  kind,
  title,
  hint,
  aspect,
}: {
  slug: string;
  kind: Kind;
  title: string;
  hint: string;
  /** Width / height of the preview. */
  aspect: string;
}) {
  const { t, locale } = useI18n();
  const file = `${slug}-${kind}.${kind === 'qr' ? 'svg' : 'png'}`;
  const path = `/api/shops/by-slug/${slug}/share/${file.slice(slug.length + 1)}?lang=${locale}`;
  return (
    <section className="mt-5">
      <SectionLabel className="mt-0">{title}</SectionLabel>
      <div className="flex gap-3 rounded-tile border border-chrome bg-porcelain p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by the server, not the CDN */}
        <img
          src={path}
          alt={interpolate(t.share.imageAlt, { name: slug, kind: title })}
          className="w-24 shrink-0 rounded-[5px] border border-chrome bg-tile object-contain"
          style={{ aspectRatio: aspect }}
          loading="lazy"
          decoding="async"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <p className="text-sm text-ink-muted">{hint}</p>
          <Button
            variant="secondary"
            onClick={() => {
              haptic.selection();
              downloadFile(path, file);
            }}
          >
            <Download className="size-4" aria-hidden />
            {t.share.download}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** /staff/shop/:id/share — a story card, a window poster and a QR code, all to the shop's link. */
export function ShareKitScreen({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const shop = useShop(shopId);
  // Each picture has its own button; nothing is the one next step.
  useMainButton(null);

  if (shop.isPending) return <ScreenLoading />;
  if (shop.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={shop.error}
        onRetry={() => void shop.refetch()}
      />
    );
  }
  const { slug, name, status } = shop.data;
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.share.title}>{typedText(name, locale)}</EnamelSign>
      {status !== 'ACTIVE' ? (
        <p className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {t.share.notLive}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-muted">{t.share.intro}</p>
          <Button
            className="mt-3 w-full"
            onClick={() => shareViaTelegram(shopBotLink(slug), t.shopProfile.shareMessage)}
          >
            <Send className="size-4" aria-hidden />
            {t.shopProfile.share}
          </Button>
          <Picture
            slug={slug}
            kind="story"
            title={t.share.storyTitle}
            hint={t.share.storyHint}
            aspect="9 / 16"
          />
          <Picture
            slug={slug}
            kind="poster"
            title={t.share.posterTitle}
            hint={t.share.posterHint}
            aspect="1240 / 1754"
          />
          <Picture slug={slug} kind="qr" title={t.share.qrTitle} hint={t.share.qrHint} aspect="1" />
        </>
      )}
    </main>
  );
}
