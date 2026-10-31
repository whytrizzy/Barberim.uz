'use client';

import { useRouter } from 'next/navigation';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { EnamelSign } from '@/ui/enamel-sign';
import type { InviteState } from './schemas';
import { useAcceptInvite, useInvite } from './use-team';

function stateText(t: Messages, state: InviteState): string | null {
  switch (state) {
    case 'valid':
      return null;
    case 'accepted':
    case 'already_member':
      return t.team.inviteAlreadyIn;
    case 'used':
      return t.team.inviteUsed;
    case 'expired':
      return t.team.inviteExpired;
  }
}

/** /invite/:token — where the bot's invite button lands. */
export function InviteScreen({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const data = invite.data;
  const inShop = data?.state === 'accepted' || data?.state === 'already_member';

  useMainButton(
    data?.state === 'valid'
      ? {
          text: t.team.inviteAccept,
          loading: accept.isPending,
          onClick: () =>
            accept.mutate(undefined, {
              onSuccess: ({ shopId }) => {
                haptic.notify('success');
                router.replace(`/staff/shop/${shopId}`);
              },
              onError: () => haptic.notify('error'),
            }),
        }
      : data && inShop
        ? {
            text: t.team.inviteOpenShop,
            onClick: () => router.replace(`/staff/shop/${data.shopId}`),
          }
        : null,
  );

  if (invite.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (invite.isError || !data) {
    const missing = invite.error instanceof ApiError && invite.error.status === 404;
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {missing ? t.team.inviteUsed : errorText(t, invite.error)}
      </p>
    );
  }

  const note = stateText(t, data.state);
  const refusal =
    accept.error instanceof ApiError
      ? (accept.error.details as { reason?: InviteState } | undefined)?.reason
      : undefined;
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.team.inviteOverline}>{data.shopName}</EnamelSign>
      {note ? (
        <p className="mt-5 text-[15px]">{note}</p>
      ) : (
        <p className="mt-5 text-[15px]">
          {interpolate(t.team.inviteBody, {
            name: data.name,
            role: t.team.roles[data.role],
          })}
        </p>
      )}
      {accept.error && (
        <p role="alert" className="mt-3 text-sm text-enamel-text">
          {(refusal && stateText(t, refusal)) ?? errorText(t, accept.error)}
        </p>
      )}
    </main>
  );
}
