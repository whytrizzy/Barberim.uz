import { z } from 'zod';
import { bookingStatusSchema } from '@/features/booking/schemas';

/** Clients shown per page of the list. */
export const CLIENTS_PAGE_SIZE = 30;
/** A regular: this many finished visits or more. */
export const REGULAR_VISITS = 3;
/** Visits listed on a client's page, latest first. */
export const CLIENT_HISTORY_LIMIT = 30;

export const CLIENT_FILTERS = ['all', 'regulars', 'no_shows', 'blocked'] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

/** GET /api/shops/:id/clients?view=list&q=&filter=&page= */
export const clientListQuerySchema = z.object({
  q: z.string().trim().max(60).default(''),
  filter: z.enum(CLIENT_FILTERS).default('all'),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

export const clientRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  visitCount: z.number(),
  noShowCount: z.number(),
  isBlocked: z.boolean(),
  /** The latest finished visit. */
  lastVisitAt: z.string().nullable(),
});
export type ClientRowDto = z.infer<typeof clientRowSchema>;

export const clientListSchema = z.object({
  clients: z.array(clientRowSchema),
  /** There are more on the next page. */
  more: z.boolean(),
});
export type ClientListDto = z.infer<typeof clientListSchema>;

/** GET /api/shops/:id/clients/:clientId */
export const clientDetailSchema = clientRowSchema.extend({
  notes: z.string().nullable(),
  /** UZS, finished visits only. */
  totalSpent: z.number(),
  /** Has Telegram behind the record (booked through the app). */
  hasTelegram: z.boolean(),
  /** Owners and admins can block; everyone who can see the client can write notes. */
  canBlock: z.boolean(),
  visits: z.array(
    z.object({
      id: z.string(),
      startAt: z.string(),
      status: bookingStatusSchema,
      masterName: z.string(),
      services: z.array(z.string()),
      totalPrice: z.number(),
    }),
  ),
});
export type ClientDetailDto = z.infer<typeof clientDetailSchema>;

/** PATCH /api/shops/:id/clients/:clientId — either field, or both. */
export const updateClientRequestSchema = z
  .object({
    /** Seen by the shop's staff only; empty clears it. */
    notes: z.string().trim().max(1000).optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((b) => b.notes !== undefined || b.isBlocked !== undefined, 'nothing to change');
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;
