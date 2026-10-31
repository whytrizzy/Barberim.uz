'use client';

import { ChevronRight, Scissors } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorText } from '@/features/api/error-text';
import { formatDuration, formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { useMainButton } from '@/telegram/use-main-button';
import { SectionLabel } from '@/ui/section-label';
import { TileList } from '@/ui/tile-list';
import { ServiceForm } from './service-form';
import { SERVICE_CATEGORIES, type ServiceDto } from './schemas';
import { useShopServices } from './use-services';

const screen = 'mx-auto max-w-[390px] px-4 pt-4 pb-6';
const title = 'font-sign text-[30px] leading-none font-bold uppercase';

function ServiceRow({
  shopId,
  service,
  link,
}: {
  shopId: string;
  service: ServiceDto;
  link: boolean;
}) {
  const { t, locale } = useI18n();
  const money = formatMoney(service.price, locale);
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-semibold">
          {service.name}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {formatDuration(service.durationMin, locale)} ·{' '}
          {interpolate(t.services.mastersCount, { count: service.staffIds.length })}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums">
        {service.priceIsFrom ? interpolate(t.services.fromPrice, { price: money }) : money}
      </span>
      {link && <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />}
    </>
  );
  const row = 'flex min-h-14 items-center gap-2.5 px-3 py-2.5';
  return (
    <li className="bg-porcelain">
      {link ? (
        <Link
          href={`/staff/shop/${shopId}/services/${service.id}`}
          className={`${row} active:bg-porcelain-sunk`}
        >
          {content}
        </Link>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  );
}

/** /staff/shop/:id/services — the price list, grouped by category. */
export function ServiceListScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useShopServices(shopId);

  useMainButton(
    query.data?.canEdit
      ? {
          text: t.services.add,
          onClick: () => router.push(`/staff/shop/${shopId}/services/new`),
        }
      : null,
  );

  if (query.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {errorText(t, query.error)}
      </p>
    );
  }

  const { services, canEdit } = query.data;
  return (
    <main className={screen}>
      <h1 className={title}>{t.services.title}</h1>
      {services.length === 0 ? (
        <div className="mt-5 grid justify-items-center gap-2 rounded-tile border border-dashed border-chrome bg-porcelain px-4 py-8 text-center">
          <Scissors className="size-6 text-ink-muted" aria-hidden />
          <p className="text-[15px] font-semibold">{t.services.empty}</p>
          {canEdit && <p className="text-sm text-ink-muted">{t.services.emptyHint}</p>}
        </div>
      ) : (
        SERVICE_CATEGORIES.map((category) => {
          const inCategory = services.filter((service) => service.category === category);
          if (inCategory.length === 0) return null;
          return (
            <section key={category} className="mt-5">
              <SectionLabel className="mt-0">{t.services.categories[category]}</SectionLabel>
              <TileList>
                {inCategory.map((service) => (
                  <ServiceRow key={service.id} shopId={shopId} service={service} link={canEdit} />
                ))}
              </TileList>
            </section>
          );
        })
      )}
    </main>
  );
}

/** /staff/shop/:id/services/new and /staff/shop/:id/services/:serviceId */
export function ServiceEditScreen({
  shopId,
  serviceId,
}: {
  shopId: string;
  /** Null when adding a new service. */
  serviceId: string | null;
}) {
  const { t } = useI18n();
  const query = useShopServices(shopId);

  if (query.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  const service = serviceId
    ? (query.data?.services.find((candidate) => candidate.id === serviceId) ?? null)
    : null;
  if (query.isError || (serviceId && !service)) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {query.isError ? errorText(t, query.error) : t.services.notFound}
      </p>
    );
  }

  return (
    <main className={screen}>
      <h1 className={`${title} mb-5`}>{service ? t.services.editTitle : t.services.newTitle}</h1>
      <ServiceForm shopId={shopId} service={service} masters={query.data.masters} />
    </main>
  );
}
