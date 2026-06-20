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

// Variant-based checkout: price is read from Shopify server-side, not our DB.
export const variantCheckoutSchema = z.object({
  handle: z.string().max(160).optional().default(""),
  variantId: z.string().min(1).max(40),
  targetLink: z.string().max(2000).optional().default(""),
  orderNotes: z.string().max(2000).optional().default(""),
  customerEmail: z.string().email().max(254).optional().or(z.literal("")).default(""),
  // Display-only option selections, e.g. { "Country": "Germany", "Package": "1000" }.
  options: z.record(z.string(), z.string().max(200)).optional().default({}),
  requireLink: z.boolean().optional().default(true),
});

export type PriceRequest = z.infer<typeof priceRequestSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type VariantCheckoutRequest = z.infer<typeof variantCheckoutSchema>;
