import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInitData } from '@/server/auth/init-data';
import { db } from '@/server/db/client';
import { resetRateLimits } from '@/server/http/rate-limit';
import { mastersOffering } from '@/server/services/catalog';
import { DELETE, PATCH } from './[id]/services/[serviceId]/route';
import { GET, POST } from './[id]/services/route';
import { POST as createShop } from './route';

// A shop's services against the real database (npm run test:db).

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const base = 960_000_000 + Math.floor(Math.random() * 1_000_000);
const userIds = { owner: BigInt(base + 1), master: BigInt(base + 2), other: BigInt(base + 3) };
type Who = keyof typeof userIds;
const shopIds: string[] = [];
let shopId = '';
let ownerStaffId = '';
let masterStaffId = '';

function req(who: Who, method: string, body?: object) {
  const initData = signInitData({ user: { id: Number(userIds[who]), first_name: who } }, token);
  return new Request('http://t/api', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const inShop = (id = shopId) => ({ params: Promise.resolve({ id }) });
const onService = (serviceId: string, id = shopId) => ({
  params: Promise.resolve({ id, serviceId }),
});

const haircut = () => ({
  name: 'Soch olish',
  category: 'ADULT',
  durationMin: 30,
  price: 60_000,
  priceIsFrom: true,
  staffIds: [ownerStaffId],
});

async function create(who: Who, body: object) {
  return POST(req(who, 'POST', body), inShop());
}

async function openShop(slug: string) {
  const response = await createShop(
    req('owner', 'POST', {
      slug,
      name: 'Service Barber',
      region: 'tashkent-city',
      district: 'yunusobod',
      address: '4-mavze, 12-uy',
    }),
  );
  const { id } = await response.json();
  shopIds.push(id);
  return id as string;
}

beforeAll(async () => {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  shopId = await openShop(`services-${Date.now().toString(36)}`);
  ownerStaffId = (await db.staff.findFirstOrThrow({ where: { shopId } })).id;
  const master = await db.user.create({
    data: { telegramId: userIds.master, firstName: 'master' },
  });
  masterStaffId = (
    await db.staff.create({
      data: { shopId, userId: master.id, displayName: 'Master', role: 'MASTER' },
    })
  ).id;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  await db.shop.deleteMany({ where: { id: { in: shopIds } } });
  await db.user.deleteMany({ where: { telegramId: { in: Object.values(userIds) } } });
  await db.$disconnect();
});

describe('shop services', () => {
  let serviceId = '';

  it('adds a service, with who does it, and lists it for the staff', async () => {
    const response = await create('owner', haircut());
    expect(response.status).toBe(201);
    const service = await response.json();
    serviceId = service.id;
    expect(service).toMatchObject({ ...haircut(), id: expect.any(String) });

    const owner = await (await GET(req('owner', 'GET'), inShop())).json();
    expect(owner.canEdit).toBe(true);
    expect(owner.services).toHaveLength(1);
    expect(owner.masters.map((m: { id: string }) => m.id).sort()).toEqual(
      [ownerStaffId, masterStaffId].sort(),
    );
    const master = await (await GET(req('master', 'GET'), inShop())).json();
    expect(master.canEdit).toBe(false);
    expect(master.services).toHaveLength(1);
  });

  it('refuses bad values and masters from outside the shop', async () => {
    for (const bad of [
      { name: ' ' },
      { category: 'VIP' },
      { durationMin: 7 },
      { durationMin: 725 },
      { price: -1 },
      { price: 10.5 },
      { staffIds: [] },
    ]) {
      expect((await create('owner', { ...haircut(), ...bad })).status).toBe(400);
    }
    const otherShop = await openShop(`services-b-${Date.now().toString(36)}`);
    const stranger = await db.staff.findFirstOrThrow({ where: { shopId: otherShop } });
    const refused = await create('owner', { ...haircut(), staffIds: [stranger.id] });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.details.reason).toBe('unknown_master');
  });

  it('lets only owners and admins change services', async () => {
    expect((await create('master', haircut())).status).toBe(403);
    expect((await create('other', haircut())).status).toBe(403);
    expect((await GET(req('other', 'GET'), inShop())).status).toBe(403);
    expect((await PATCH(req('master', 'PATCH', haircut()), onService(serviceId))).status).toBe(403);
    expect((await DELETE(req('master', 'DELETE'), onService(serviceId))).status).toBe(403);
  });

  it('changes who does a service, and masters who stay keep their own price', async () => {
    await db.staffService.update({
      where: { staffId_serviceId: { staffId: ownerStaffId, serviceId } },
      data: { priceOverride: 80_000 },
    });
    const response = await PATCH(
      req('owner', 'PATCH', {
        ...haircut(),
        price: 70_000,
        staffIds: [ownerStaffId, masterStaffId],
      }),
      onService(serviceId),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ price: 70_000 });
    const links = await db.staffService.findMany({ where: { serviceId } });
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.staffId === ownerStaffId)?.priceOverride).toBe(80_000);

    await PATCH(
      req('owner', 'PATCH', { ...haircut(), staffIds: [masterStaffId] }),
      onService(serviceId),
    );
    const left = await db.staffService.findMany({ where: { serviceId } });
    expect(left.map((l) => l.staffId)).toEqual([masterStaffId]);
  });

  it('cannot reach a service through another shop', async () => {
    const elsewhere = shopIds[1]!;
    const theirMaster = await db.staff.findFirstOrThrow({ where: { shopId: elsewhere } });
    const body = { ...haircut(), staffIds: [theirMaster.id] };
    expect((await PATCH(req('owner', 'PATCH', body), onService(serviceId, elsewhere))).status).toBe(
      404,
    );
    expect((await DELETE(req('owner', 'DELETE'), onService(serviceId, elsewhere))).status).toBe(
      404,
    );
  });

  it('deletes a service: it leaves the list and can no longer be booked', async () => {
    const response = await DELETE(req('owner', 'DELETE'), onService(serviceId));
    expect(response.status).toBe(200);
    const list = await (await GET(req('owner', 'GET'), inShop())).json();
    expect(list.services).toHaveLength(0);
    expect(await mastersOffering(shopId, [serviceId])).toEqual([]);
    expect((await DELETE(req('owner', 'DELETE'), onService(serviceId))).status).toBe(404);
    expect((await PATCH(req('owner', 'PATCH', haircut()), onService(serviceId))).status).toBe(404);
  });
});
