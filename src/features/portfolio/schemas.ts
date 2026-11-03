import { z } from 'zod';

/** Enough to show someone's work without a slow page on mobile internet. */
export const MAX_PORTFOLIO_PHOTOS = 12;

const photo = z.object({ id: z.string(), url: z.string() });

/** GET /api/shops/:id/staff/:staffId/portfolio (and every change to it) */
export const portfolioSchema = z.object({
  staffId: z.string(),
  name: z.string(),
  /** The master themself, or an owner/admin who manages them. */
  canEdit: z.boolean(),
  photos: z.array(photo),
});
export type PortfolioDto = z.infer<typeof portfolioSchema>;

/** PUT /api/shops/:id/staff/:staffId/portfolio — every current photo id, in the new order. */
export const reorderPortfolioRequestSchema = z.object({
  order: z.array(z.uuid()).min(1).max(MAX_PORTFOLIO_PHOTOS),
});
