import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as preview, POST as accept } from '../invites/[token]/route';
import { POST as invite } from './[id]/staff/[staffId]/invite/route';
import { DELETE, PATCH } from './[id]/staff/[staffId]/route';
import { GET, POST } from './[id]/staff/route';
import { POST as createShop } from './route';

// The team and its invite links against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 970_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = {
  owner: BigInt(base + 1),
  master: BigInt(base + 2),
  admin: BigInt(base + 3),
  late: BigInt(base + 4),
};
type Who = keyof typeof userIds;
let shopId = '';
let ownerStaffId = '';
let serviceId = '';

function req(who: Who, method: string, body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const inShop = () => ({ params: Promise.resolve({ id: shopId }) });
const onMember = (staffId: string) => ({ params: Promise.resolve({ id: shopId, staffId }) });
const withToken = (value: string) => ({ params: Promise.resolve({ token: value }) });

async function add(who: Who, name: string, role = 'MASTER') {
  return POST(req(who, 'POST', { name, role }), inShop());
}

async function addedId(who: Who, name: string, role = 'MASTER'): Promise<string> {
  return (await (await add(who, name, role)).json()).id;
}

async function newInvite(staffId: string, who: Who = 'owner'): Promise<string> {
  const response = await invite(req(who, 'POST'), onMember(staffId));
  expect(response.status).toBe(201);
  return (await response.json()).token;
}

const acceptAs = (who: Who, value: string) => accept(req(who, 'POST'), withToken(value));
const reasonOf = async (response: Response) => (await response.json()).error.details.reason;

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const response = await createShop(
    req('owner', 'POST', {
      slug: `team-${Date.now().toString(36)}`,
      name: 'Team Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
    }),
  );
  shopId = (await response.json()).id;
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  serviceId = (
    await db.service.create({ data: { shopId, name: 'Soch', durationMin: 30, price: 60_000 } })
  ).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: shopId } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('team and invites', () => {
  let masterStaffId = '';
  let masterToken = '';

  it('adds a master with the shop’s services and no login yet', async () => {
    masterStaffId = await addedId('owner', 'Sardor');
    const link = await db.staffService.findFirst({ where: { staffId: masterStaffId, serviceId } });
    expect(link).not.toBeNull();
    const team = await (await GET(req('owner', 'GET'), inShop())).json();
    expect(team).toMatchObject({ canAdd: true, canAssignAdmin: true });
    expect(team.members.find((m: { id: string }) => m.id === masterStaffId)).toMatchObject({
      name: 'Sardor',
      role: 'MASTER',
      linked: false,
      inviteExpiresAt: null,
    });
  });

  it('stores only a hash of the link, and a new link replaces the old one', async () => {
    const first = await newInvite(masterStaffId);
    masterToken = await newInvite(masterStaffId);
    const rows = await db.staffInvite.findMany({ where: { staffId: masterStaffId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(masterToken);
    expect((await acceptAs('master', first)).status).toBe(404);
  });

  it('shows the invite, then joins the shop with the person’s own login', async () => {
    const before = await (await preview(req('master', 'GET'), withToken(masterToken))).json();
    expect(before).toMatchObject({ shopName: 'Team Barber', name: 'Sardor', state: 'valid' });

    const response = await acceptAs('master', masterToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shopId });

    const team = await (await GET(req('master', 'GET'), inShop())).json();
    expect(team).toMatchObject({ canAdd: false, canAssignAdmin: false });
    expect(team.members.find((m: { isYou: boolean }) => m.isYou).id).toBe(masterStaffId);
    expect((await acceptAs('master', masterToken)).status).toBe(200); // double tap
  });

  it('never lets a link be used twice, or by someone already in the shop', async () => {
    const used = await acceptAs('admin', masterToken);
    expect(used.status).toBe(409);
    expect(await reasonOf(used)).toBe('used');

    const spare = await addedId('owner', 'Spare');
    const own = await acceptAs('owner', await newInvite(spare));
    expect(own.status).toBe(409);
    expect(await reasonOf(own)).toBe('already_member');
    const linked = await invite(req('owner', 'POST'), onMember(masterStaffId));
    expect(await reasonOf(linked)).toBe('already_linked');
  });

  it('lets only one of two people win the same link at once', async () => {
    const seat = await addedId('owner', 'Seat');
    const link = await newInvite(seat);
    const results = await Promise.all([acceptAs('admin', link), acceptAs('late', link)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results[0]!.status === 200 ? 'admin' : 'late';
    const staff = await db.staff.findUniqueOrThrow({
      where: { id: seat },
      include: { user: true },
    });
    expect(staff.user?.telegramId).toBe(userIds[winner]);
    await DELETE(req('owner', 'DELETE'), onMember(seat));
  });

  it('refuses an expired link', async () => {
    const seat = await addedId('owner', 'Old');
    const link = await newInvite(seat);
    await db.staffInvite.updateMany({
      where: { staffId: seat },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await acceptAs('admin', link);
    expect(await reasonOf(response)).toBe('expired');
  });

  it('keeps roles in order: owners make admins, admins manage only masters', async () => {
    expect((await add('master', 'Nope')).status).toBe(403);

    const adminStaffId = await addedId('owner', 'Admin', 'ADMIN');
    await acceptAs('admin', await newInvite(adminStaffId));

    expect((await add('admin', 'Second admin', 'ADMIN')).status).toBe(403);
    const hired = await addedId('admin', 'Hired');
    const body = { name: 'Hired', isBookable: true };
    expect(
      (await PATCH(req('admin', 'PATCH', { ...body, role: 'ADMIN' }), onMember(hired))).status,
    ).toBe(403);
    expect(
      (await PATCH(req('admin', 'PATCH', { ...body, role: 'MASTER' }), onMember(hired))).status,
    ).toBe(200);
    expect((await DELETE(req('admin', 'DELETE'), onMember(ownerStaffId))).status).toBe(403);
    expect((await DELETE(req('admin', 'DELETE'), onMember(adminStaffId))).status).toBe(403);

    const owner = { name: 'Owner', isBookable: false };
    expect(
      (await PATCH(req('owner', 'PATCH', { ...owner, role: 'MASTER' }), onMember(ownerStaffId)))
        .status,
    ).toBe(403);
    expect(
      (await PATCH(req('owner', 'PATCH', { ...owner, role: 'OWNER' }), onMember(ownerStaffId)))
        .status,
    ).toBe(200);
    expect(
      (await PATCH(req('owner', 'PATCH', { ...body, role: 'OWNER' }), onMember(hired))).status,
    ).toBe(403);
    expect((await DELETE(req('owner', 'DELETE'), onMember(ownerStaffId))).status).toBe(403);
  });

  it('won’t remove someone with clients booked; removal ends access and allows a return', async () => {
    const client = await db.shopClient.create({ data: { shopId, name: 'Client' } });
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const booking = await db.booking.create({
      data: {
        shopId,
        staffId: masterStaffId,
        shopClientId: client.id,
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60 * 1000),
        totalPrice: 60_000,
      },
    });
    const refused = await DELETE(req('owner', 'DELETE'), onMember(masterStaffId));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.details).toEqual({
      reason: 'has_upcoming_bookings',
      count: 1,
    });

    await db.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED_SHOP' } });
    expect((await DELETE(req('owner', 'DELETE'), onMember(masterStaffId))).status).toBe(200);
    expect((await GET(req('master', 'GET'), inShop())).status).toBe(403);

    const back = await addedId('owner', 'Sardor');
    expect((await acceptAs('master', await newInvite(back))).status).toBe(200);
    expect((await GET(req('master', 'GET'), inShop())).status).toBe(200);
  });
});
