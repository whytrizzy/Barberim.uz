'use client';

import { ChevronRight, Copy, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { clientEnv } from '@/env/client';
import { formatDayMonth } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { getWebApp, safely } from '@/telegram/webapp';
import { Button } from '@/ui/button';
import { Select } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { Tick } from '@/ui/tick';
import { TileList } from '@/ui/tile-list';
import {
  MAX_SHOP_STAFF,
  addStaffRequestSchema,
  updateStaffRequestSchema,
  type StaffMemberDto,
} from './schemas';
import { useAddStaff, useMemberActions, useTeam } from './use-team';

const screen = 'mx-auto max-w-[390px] px-4 pt-4 pb-6';
const title = 'font-sign text-[30px] leading-none font-bold uppercase';

function teamError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details as { reason?: string; count?: number } | undefined;
    if (details?.reason === 'too_many_staff') {
      return interpolate(t.team.tooMany, { count: MAX_SHOP_STAFF });
    }
    if (details?.reason === 'has_upcoming_bookings') {
      return interpolate(t.team.hasBookings, { count: details.count ?? 1 });
    }
  }
  return errorText(t, error);
}

function memberStatus(t: Messages, member: StaffMemberDto): string {
  if (member.linked) return t.team.joined;
  return member.inviteExpiresAt ? t.team.invited : t.team.notInvited;
}

function MemberRow({ shopId, member }: { shopId: string; member: StaffMemberDto }) {
  const { t } = useI18n();
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-semibold">
          {member.name}
          {member.isYou && <span className="font-normal text-ink-muted"> · {t.team.you}</span>}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {t.team.roles[member.role]} · {memberStatus(t, member)}
        </span>
      </span>
      {member.canManage && <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />}
    </>
  );
  const row = 'flex min-h-14 items-center gap-2.5 px-3 py-2.5';
  return (
    <li className="bg-porcelain">
      {member.canManage ? (
        <Link
          href={`/staff/shop/${shopId}/team/${member.id}`}
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

/** /staff/shop/:id/team — everyone who works at the shop. */
export function TeamListScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useTeam(shopId);

  useMainButton(
    query.data?.canAdd
      ? { text: t.team.add, onClick: () => router.push(`/staff/shop/${shopId}/team/new`) }
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
  return (
    <main className={screen}>
      <h1 className={`${title} mb-5`}>{t.team.title}</h1>
      <TileList>
        {query.data.members.map((member) => (
          <MemberRow key={member.id} shopId={shopId} member={member} />
        ))}
      </TileList>
    </main>
  );
}

function roleOptions(t: Messages, canAssignAdmin: boolean) {
  return (canAssignAdmin ? (['MASTER', 'ADMIN'] as const) : (['MASTER'] as const)).map((value) => ({
    value,
    label: t.team.roles[value],
  }));
}

/** /staff/shop/:id/team/new — then on to their page, which makes the invite link. */
export function TeamAddScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const team = useTeam(shopId);
  const add = useAddStaff(shopId);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'MASTER' | 'ADMIN'>('MASTER');
  const [submitted, setSubmitted] = useState(false);
  const parsed = addStaffRequestSchema.safeParse({ name, role });

  function submit() {
    setSubmitted(true);
    if (!parsed.success) {
      haptic.notify('error');
      return;
    }
    add.mutate(parsed.data, {
      onSuccess: ({ id }) => router.replace(`/staff/shop/${shopId}/team/${id}`),
      onError: () => haptic.notify('error'),
    });
  }

  useMainButton({ text: t.team.addSubmit, loading: add.isPending, onClick: submit });

  return (
    <main className={screen}>
      <h1 className={`${title} mb-5`}>{t.team.addTitle}</h1>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label={t.team.name}
          placeholder={t.team.namePlaceholder}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          hint={t.team.nameHint}
          error={submitted && !parsed.success ? t.team.nameRequired : null}
        />
        {team.data?.canAssignAdmin && (
          <Select
            label={t.team.role}
            options={roleOptions(t, true)}
            value={role}
            onChange={(e) => setRole(e.target.value as 'MASTER' | 'ADMIN')}
          />
        )}
        {add.error && (
          <p role="alert" className="text-sm text-enamel-text">
            {teamError(t, add.error)}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </main>
  );
}

/** Makes the link and hands it over: Telegram's share sheet, or the clipboard. */
function InvitePanel({ shopId, member }: { shopId: string; member: StaffMemberDto }) {
  const { t, locale } = useI18n();
  const { invite } = useMemberActions(shopId, member.id);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const bot = clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot';
  const link = token ? `https://t.me/${bot}?start=invite_${token}` : null;

  async function create() {
    // A new link switches the old one off, so check before breaking one already sent.
    if (member.inviteExpiresAt && !(await confirmAction(t.team.inviteReplaceConfirm))) return;
    setCopied(false);
    invite.mutate(undefined, {
      onSuccess: (created) => {
        haptic.notify('success');
        setToken(created.token);
      },
      onError: () => haptic.notify('error'),
    });
  }

  function share() {
    if (!link) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t.team.inviteMessage)}`;
    const webApp = getWebApp();
    if (webApp) safely(() => webApp.openTelegramLink(url));
    else window.open(url, '_blank', 'noopener');
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      haptic.notify('success');
      setCopied(true);
    } catch {
      setCopied(false); // the link is on screen and can still be selected by hand
    }
  }

  return (
    <section className="grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
      <h2 className="text-[15px] font-semibold">{t.team.inviteTitle}</h2>
      {link ? (
        <>
          <p className="text-sm break-all text-ink-muted select-all">{link}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={share}>
              <Send className="size-4" aria-hidden />
              {t.team.inviteShare}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void copy()}>
              <Copy className="size-4" aria-hidden />
              {copied ? t.team.inviteCopied : t.team.inviteCopy}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {member.inviteExpiresAt
              ? interpolate(t.team.inviteSent, {
                  date: formatDayMonth(new Date(member.inviteExpiresAt), locale),
                })
              : t.team.inviteHint}
          </p>
          <Button variant="secondary" loading={invite.isPending} onClick={() => void create()}>
            {member.inviteExpiresAt ? t.team.inviteAgain : t.team.inviteCreate}
          </Button>
        </>
      )}
      {invite.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {teamError(t, invite.error)}
        </p>
      )}
    </section>
  );
}

function MemberForm({
  shopId,
  member,
  canAssignAdmin,
}: {
  shopId: string;
  member: StaffMemberDto;
  canAssignAdmin: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { save, remove } = useMemberActions(shopId, member.id);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [isBookable, setIsBookable] = useState(member.isBookable);
  const [submitted, setSubmitted] = useState(false);
  const parsed = updateStaffRequestSchema.safeParse({ name, role, isBookable });

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

  async function removeMember() {
    const question = interpolate(t.team.removeConfirm, { name: member.name });
    if (!(await confirmAction(question))) return;
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
        label={t.team.name}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        error={submitted && !parsed.success ? t.team.nameRequired : null}
      />
      {member.role !== 'OWNER' && canAssignAdmin && (
        <Select
          label={t.team.role}
          options={roleOptions(t, true)}
          value={role}
          onChange={(e) => setRole(e.target.value as 'MASTER' | 'ADMIN')}
        />
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-tile text-[15px] has-focus-visible:ring-2 has-focus-visible:ring-pick">
        <Tick
          checked={isBookable}
          onChange={() => {
            haptic.selection();
            setIsBookable(!isBookable);
          }}
        />
        {t.team.bookable}
      </label>
      {!member.linked && <InvitePanel shopId={shopId} member={member} />}
      {failure && (
        <p role="alert" className="text-sm text-enamel-text">
          {teamError(t, failure)}
        </p>
      )}
      {member.role !== 'OWNER' && !member.isYou && (
        <Button
          variant="ghost"
          className="justify-self-start px-2"
          loading={remove.isPending}
          disabled={save.isPending}
          onClick={() => void removeMember()}
        >
          {!remove.isPending && <Trash2 className="size-4" aria-hidden />}
          {t.team.remove}
        </Button>
      )}
      <button type="submit" hidden />
    </form>
  );
}

/** /staff/shop/:id/team/:staffId */
export function TeamMemberScreen({ shopId, staffId }: { shopId: string; staffId: string }) {
  const { t } = useI18n();
  const query = useTeam(shopId);

  if (query.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  const member = query.data?.members.find((candidate) => candidate.id === staffId);
  if (query.isError || !member?.canManage) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {query.isError ? errorText(t, query.error) : t.team.notFound}
      </p>
    );
  }
  return (
    <main className={screen}>
      <h1 className={`${title} mb-5`}>{member.name}</h1>
      <MemberForm
        shopId={shopId}
        member={member}
        canAssignAdmin={query.data?.canAssignAdmin ?? false}
      />
    </main>
  );
}
