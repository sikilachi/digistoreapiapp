import { z } from "zod";

/** A map of optionGroupKey -> selected value. Values are strings. */
export const selectedOptionsSchema = z.record(z.string(), z.string().max(200)).default({});

export const priceRequestSchema = z.object({
  serviceId: z.string().uuid().optional(),
  slug: z.string().max(120).optional(),
  options: selectedOptionsSchema,
});

export const checkoutRequestSchema = z.object({
  serviceId: z.string().uuid().optional(),
  slug: z.string().max(120).optional(),
  options: selectedOptionsSchema,
  targetLink: z.string().max(2000).optional().default(""),
  orderNotes: z.string().max(2000).optional().default(""),
  customerEmail: z.string().email().max(254).optional().or(z.literal("")).default(""),
  shopifyProductId: z.string().max(120).optional(),
  shopifyVariantId: z.string().max(120).optional(),
});

export type PriceRequest = z.infer<typeof priceRequestSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
