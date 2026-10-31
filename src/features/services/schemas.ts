import { z } from 'zod';

/** In the order the shop's list shows them. */
export const SERVICE_CATEGORIES = ['ADULT', 'KIDS', 'BEARD', 'WEDDING', 'OTHER'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Same bounds as the services_values check in the database; slots work in 5-minute steps. */
export const MIN_SERVICE_MINUTES = 5;
export const MAX_SERVICE_MINUTES = 720;
export const MAX_SERVICE_PRICE = 100_000_000;
/** More than any real price list; stops a runaway client filling the table. */
export const MAX_SHOP_SERVICES = 100;

/** POST /api/shops/:id/services and PATCH /api/shops/:id/services/:serviceId */
export const serviceRequestSchema = z.object({
  name: z.string().trim().min(2).max(60),
  category: z.enum(SERVICE_CATEGORIES),
  durationMin: z.number().int().min(MIN_SERVICE_MINUTES).max(MAX_SERVICE_MINUTES).multipleOf(5),
  price: z.number().int().min(0).max(MAX_SERVICE_PRICE),
  /** Shown as "from 60 000 soʻm". */
  priceIsFrom: z.boolean(),
  /** The masters who do this service. */
  staffIds: z.array(z.uuid()).min(1).max(MAX_SHOP_SERVICES),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(SERVICE_CATEGORIES),
  durationMin: z.number(),
  price: z.number(),
  priceIsFrom: z.boolean(),
  staffIds: z.array(z.string()),
});
export type ServiceDto = z.infer<typeof serviceSchema>;

/** GET /api/shops/:id/services */
export const shopServicesSchema = z.object({
  /** Owners and admins edit; masters only read. */
  canEdit: z.boolean(),
  services: z.array(serviceSchema),
  /** Everyone who can be given a service. */
  masters: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ShopServicesDto = z.infer<typeof shopServicesSchema>;

export const deletedSchema = z.object({ deleted: z.literal(true) });

/** `details.reason` when a service change is refused. */
export type ServiceRefusal = 'too_many_services' | 'unknown_master';
