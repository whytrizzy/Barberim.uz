import 'server-only';
import {
  MAX_SHOP_SERVICES,
  type ServiceDto,
  type ServiceRefusal,
  type ServiceRequest,
  type ShopServicesDto,
} from '@/features/services/schemas';
import type { Service, User } from '@/generated/prisma/client';
import { requireStaff } from '../auth/auth';
import { db } from '../db/client';
import { AppError } from '../http/errors';

const editors = ['OWNER', 'ADMIN'] as const;
const canTakeClients = { isActive: true, isBookable: true } as const;

function refuse(reason: ServiceRefusal, code: 'conflict' | 'invalid_input'): never {
  throw new AppError(code, reason, { reason });
}

const fields = (input: ServiceRequest) => ({
  name: input.name,
  category: input.category,
  durationMin: input.durationMin,
  price: input.price,
  priceIsFrom: input.priceIsFrom,
});

const toDto = (service: Service, staffIds: string[]): ServiceDto => ({
  id: service.id,
  name: service.name,
  category: service.category,
  durationMin: service.durationMin,
  price: service.price,
  priceIsFrom: service.priceIsFrom,
  staffIds,
});

async function checkMasters(shopId: string, staffIds: string[]): Promise<string[]> {
  const unique = [...new Set(staffIds)];
  const found = await db.staff.count({
    where: { id: { in: unique }, shopId, ...canTakeClients },
  });
  if (found !== unique.length) refuse('unknown_master', 'invalid_input');
  return unique;
}

/** The shop's price list and masters, for its staff. */
export async function listShopServices(user: User, shopId: string): Promise<ShopServicesDto> {
  const staff = await requireStaff(user.id, shopId);
  const [services, masters] = await Promise.all([
    db.service.findMany({
      where: { shopId, isActive: true },
      include: {
        staff: { where: { staff: canTakeClients }, select: { staffId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.staff.findMany({
      where: { shopId, ...canTakeClients },
      select: { id: true, displayName: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  return {
    canEdit: staff.role !== 'MASTER',
    services: services.map((service) =>
      toDto(
        service,
        service.staff.map((link) => link.staffId),
      ),
    ),
    masters: masters.map((master) => ({ id: master.id, name: master.displayName })),
  };
}

export async function createService(
  user: User,
  shopId: string,
  input: ServiceRequest,
): Promise<ServiceDto> {
  await requireStaff(user.id, shopId, [...editors]);
  const staffIds = await checkMasters(shopId, input.staffIds);
  const existing = await db.service.count({ where: { shopId, isActive: true } });
  if (existing >= MAX_SHOP_SERVICES) refuse('too_many_services', 'conflict');

  const service = await db.$transaction(async (tx) => {
    const { _max } = await tx.service.aggregate({ where: { shopId }, _max: { sortOrder: true } });
    const created = await tx.service.create({
      data: {
        shopId,
        ...fields(input),
        sortOrder: (_max.sortOrder ?? -1) + 1,
        staff: { create: staffIds.map((staffId) => ({ staffId })) },
      },
    });
    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: 'service.create',
        entity: 'service',
        entityId: created.id,
      },
    });
    return created;
  });
  return toDto(service, staffIds);
}

export async function updateService(
  user: User,
  shopId: string,
  serviceId: string,
  input: ServiceRequest,
): Promise<ServiceDto> {
  await requireStaff(user.id, shopId, [...editors]);
  const staffIds = await checkMasters(shopId, input.staffIds);

  const service = await db.$transaction(async (tx) => {
    const { count } = await tx.service.updateMany({
      where: { id: serviceId, shopId, isActive: true },
      data: fields(input),
    });
    if (count === 0) throw new AppError('not_found', 'no such service');
    // Masters who stay keep their own price and time; someone away keeps theirs for their return.
    await tx.staffService.deleteMany({
      where: { serviceId, staffId: { notIn: staffIds }, staff: canTakeClients },
    });
    await tx.staffService.createMany({
      data: staffIds.map((staffId) => ({ staffId, serviceId })),
      skipDuplicates: true,
    });
    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        action: 'service.update',
        entity: 'service',
        entityId: serviceId,
      },
    });
    return tx.service.findUniqueOrThrow({ where: { id: serviceId } });
  });
  return toDto(service, staffIds);
}

/** Hides the service from now on. Past and upcoming bookings keep their own copy of its details. */
export async function deleteService(user: User, shopId: string, serviceId: string): Promise<void> {
  await requireStaff(user.id, shopId, [...editors]);
  const { count } = await db.service.updateMany({
    where: { id: serviceId, shopId, isActive: true },
    data: { isActive: false },
  });
  if (count === 0) throw new AppError('not_found', 'no such service');
  await db.auditLog.create({
    data: {
      shopId,
      actorUserId: user.id,
      action: 'service.delete',
      entity: 'service',
      entityId: serviceId,
    },
  });
}
