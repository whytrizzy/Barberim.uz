'use client';

import { useState } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { groupDigits } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import { Tick } from '@/ui/tick';
import { TileList } from '@/ui/tile-list';
import { PROVIDER_NAMES } from './deposit-panel';
import type { DepositProvider, DepositSettingsDto, DepositSettingsRequest } from './schemas';
import { useDepositSettings, useSaveDepositSettings } from './use-deposits';

type ProviderForm = { accountId: string; login: string; secret: string; test: boolean };
const blank: ProviderForm = { accountId: '', login: '', secret: '', test: false };

function saveError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'secret_required') return t.deposits.secretRequired;
    if (reason === 'cannot_store_secrets') return t.deposits.cannotConnect;
  }
  return errorText(t, error);
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] has-focus-visible:ring-2 has-focus-visible:ring-pick">
      <Tick
        checked={checked}
        onChange={() => {
          haptic.selection();
          onChange();
        }}
      />
      {children}
    </label>
  );
}

function DepositForm({ shopId, settings }: { shopId: string; settings: DepositSettingsDto }) {
  const { t } = useI18n();
  const save = useSaveDepositSettings(shopId);
  const connected = (p: DepositProvider) => settings.accounts.find((a) => a.provider === p);
  const initial = (p: DepositProvider): ProviderForm => {
    const a = connected(p);
    return a ? { accountId: a.accountId, login: a.login ?? '', secret: '', test: a.test } : blank;
  };
  const [amount, setAmount] = useState(settings.amount ? String(settings.amount) : '');
  const [afterNoShow, setAfterNoShow] = useState(settings.afterNoShow);
  const [masterIds, setMasterIds] = useState(
    settings.masters.filter((m) => m.requiresDeposit).map((m) => m.id),
  );
  const [forms, setForms] = useState<Record<DepositProvider, ProviderForm>>({
    PAYME: initial('PAYME'),
    CLICK: initial('CLICK'),
    UZUM: initial('UZUM'),
  });
  const [editing, setEditing] = useState<Record<DepositProvider, boolean>>({
    PAYME: Boolean(connected('PAYME')),
    CLICK: Boolean(connected('CLICK')),
    UZUM: Boolean(connected('UZUM')),
  });
  const [remove, setRemove] = useState<DepositProvider[]>([]);
  const [saved, setSaved] = useState(false);

  const set = (p: DepositProvider, patch: Partial<ProviderForm>) => {
    setForms((all) => ({ ...all, [p]: { ...all[p], ...patch } }));
    setSaved(false);
  };

  function submit() {
    const accounts: DepositSettingsRequest['accounts'] = [];
    const secret = (p: DepositProvider) => forms[p].secret.trim() || undefined;
    if (editing.PAYME && !remove.includes('PAYME')) {
      accounts.push({
        provider: 'PAYME',
        accountId: forms.PAYME.accountId.trim(),
        secret: secret('PAYME'),
        test: forms.PAYME.test,
      });
    }
    if (editing.CLICK && !remove.includes('CLICK')) {
      accounts.push({
        provider: 'CLICK',
        accountId: forms.CLICK.accountId.trim(),
        login: forms.CLICK.login.trim(),
        secret: secret('CLICK'),
      });
    }
    if (editing.UZUM && !remove.includes('UZUM')) {
      accounts.push({
        provider: 'UZUM',
        accountId: forms.UZUM.accountId.trim(),
        login: forms.UZUM.login.trim(),
        secret: secret('UZUM'),
      });
    }
    save.mutate(
      {
        amount: amount === '' ? 0 : Number(amount),
        afterNoShow,
        masterIds,
        accounts,
        remove,
      },
      {
        onSuccess: (next) => {
          haptic.notify('success');
          setSaved(true);
          setRemove([]);
          setForms({
            PAYME: { ...forms.PAYME, secret: '' },
            CLICK: { ...forms.CLICK, secret: '' },
            UZUM: { ...forms.UZUM, secret: '' },
          });
          setEditing({
            PAYME: next.accounts.some((a) => a.provider === 'PAYME'),
            CLICK: next.accounts.some((a) => a.provider === 'CLICK'),
            UZUM: next.accounts.some((a) => a.provider === 'UZUM'),
          });
        },
        onError: () => haptic.notify('error'),
      },
    );
  }

  useMainButton({ text: t.common.save, loading: save.isPending, onClick: submit });

  const providerSection = (p: DepositProvider) => {
    const account = connected(p);
    if (!editing[p]) {
      return (
        <Button
          key={p}
          variant="secondary"
          disabled={!settings.canConnect}
          onClick={() => setEditing((all) => ({ ...all, [p]: true }))}
        >
          {interpolate(t.deposits.connect, { provider: PROVIDER_NAMES[p] })}
        </Button>
      );
    }
    const removing = remove.includes(p);
    return (
      <fieldset key={p} className="grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
        <legend className="px-1 text-sm font-semibold">{PROVIDER_NAMES[p]}</legend>
        <TextField
          label={p === 'PAYME' ? t.deposits.merchantId : t.deposits.serviceId}
          value={forms[p].accountId}
          autoComplete="off"
          disabled={removing}
          onChange={(e) => set(p, { accountId: e.target.value })}
        />
        {p === 'CLICK' && (
          <TextField
            label={t.deposits.clickMerchantId}
            inputMode="numeric"
            value={forms[p].login}
            autoComplete="off"
            disabled={removing}
            onChange={(e) => set(p, { login: e.target.value.replace(/\D/g, '') })}
          />
        )}
        {p === 'UZUM' && (
          <TextField
            label={t.deposits.uzumLogin}
            value={forms[p].login}
            autoComplete="off"
            disabled={removing}
            onChange={(e) => set(p, { login: e.target.value })}
          />
        )}
        <TextField
          label={
            p === 'PAYME'
              ? t.deposits.paymeKey
              : p === 'UZUM'
                ? t.deposits.uzumPassword
                : t.deposits.secretKey
          }
          type="password"
          autoComplete="new-password"
          value={forms[p].secret}
          disabled={removing}
          hint={account ? t.deposits.savedSecret : undefined}
          onChange={(e) => set(p, { secret: e.target.value })}
        />
        {p === 'PAYME' && (
          <Check
            checked={forms.PAYME.test}
            onChange={() => set('PAYME', { test: !forms.PAYME.test })}
          >
            {t.deposits.testMode}
          </Check>
        )}
        {account && (
          <div className="text-sm">
            <p className="text-ink-muted">{t.deposits.callback}</p>
            {account.callbackUrls.map((url) => (
              <p key={url} className="mt-1 font-semibold break-all select-all">
                {url}
              </p>
            ))}
            {p === 'UZUM' && <p className="mt-1 text-ink-muted">{t.deposits.uzumField}</p>}
          </div>
        )}
        {account && (
          <Button
            variant="ghost"
            className="justify-self-start px-2"
            onClick={() => {
              haptic.selection();
              setRemove((all) => (removing ? all.filter((x) => x !== p) : [...all, p]));
              setSaved(false);
            }}
          >
            {removing ? t.common.cancel : t.deposits.disconnect}
          </Button>
        )}
      </fieldset>
    );
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">{t.deposits.intro}</p>
      <TextField
        label={t.deposits.amount}
        inputMode="numeric"
        placeholder="0"
        autoComplete="off"
        hint={t.deposits.amountHint}
        value={amount === '' ? '' : groupDigits(Number(amount))}
        onChange={(e) => {
          setAmount(e.target.value.replace(/\D/g, '').slice(0, 8));
          setSaved(false);
        }}
      />
      <Check checked={afterNoShow} onChange={() => setAfterNoShow(!afterNoShow)}>
        {t.deposits.afterNoShow}
      </Check>

      <section>
        <SectionLabel className="mt-0">{t.deposits.masters}</SectionLabel>
        <TileList>
          {settings.masters.map((master) => {
            const checked = masterIds.includes(master.id);
            return (
              <li key={master.id} className="bg-porcelain px-3">
                <Check
                  checked={checked}
                  onChange={() =>
                    setMasterIds((all) =>
                      checked ? all.filter((id) => id !== master.id) : [...all, master.id],
                    )
                  }
                >
                  {master.name}
                </Check>
              </li>
            );
          })}
        </TileList>
      </section>

      <section className="grid gap-3">
        <div>
          <SectionLabel className="mt-0">{t.deposits.providers}</SectionLabel>
          <p className="text-sm text-ink-muted">{t.deposits.providersHint}</p>
          {!settings.canConnect && (
            <p className="mt-1 text-sm text-enamel-text">{t.deposits.cannotConnect}</p>
          )}
          {settings.accounts.length === 0 && (
            <p className="mt-1 text-sm text-ink-muted">{t.deposits.noProvider}</p>
          )}
        </div>
        {providerSection('PAYME')}
        {providerSection('CLICK')}
        {providerSection('UZUM')}
      </section>

      {saved && (
        <p role="status" className="text-sm font-semibold text-success">
          {t.deposits.saved}
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {saveError(t, save.error)}
        </p>
      )}
    </div>
  );
}

/** /staff/shop/:id/deposits — the owner sets up online deposits. */
export function DepositSettingsScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const query = useDepositSettings(shopId);
  if (query.isPending) return <ScreenLoading />;
  if (query.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-4 font-sign text-[30px] leading-none font-bold uppercase">
        {t.deposits.title}
      </h1>
      <DepositForm shopId={shopId} settings={query.data} />
    </main>
  );
}
