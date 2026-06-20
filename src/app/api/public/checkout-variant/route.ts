import { NextRequest } from "next/server";
import { clientIp, jsonWithCors, preflight } from "@/lib/http";
import { variantCheckoutSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVariantInfo } from "@/lib/shopify/admin";
import { createBuyUrl } from "@/lib/digistore/client";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_FAIL = {
  error: "checkout_failed",
  message: "Checkout could not be created. Please contact support.",
};

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * POST /api/public/checkout-variant
 *
 * "Zero-config" storefront checkout: the theme sends the selected Shopify
 * variant id (+ target link + display options). The server reads the variant's
 * authoritative PRICE from Shopify (never trusting the browser), then creates a
 * dynamic Digistore24 checkout for that price using a single container product.
 *
 * No per-product setup in our admin and no per-variant Digistore product needed
 * — add a variant in Shopify and Buy Now just works.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const db = supabaseAdmin();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "invalid_json" }, origin, { status: 400 });
  }

  const parsed = variantCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors({ error: "invalid_request" }, origin, { status: 400 });
  }
  const input = parsed.data;

  // Require a target link if the theme says so.
  if (input.requireLink && (!input.targetLink || input.targetLink.trim() === "")) {
    return jsonWithCors(
      { error: "missing_link", message: "Target link is required." },
      origin,
      { status: 422 },
    );
  }

  // 1. Authoritative price from Shopify (server-side).
  const variant = await getVariantInfo(input.variantId);
  if (!variant) {
    await logEvent({
      source: "checkout",
      level: "error",
      event: "variant_lookup_failed",
      message: `Could not load variant ${input.variantId} from Shopify`,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 502 });
  }
  if (variant.price <= 0) {
    await logEvent({
      source: "checkout",
      level: "error",
      event: "variant_zero_price",
      message: `Variant ${input.variantId} has no price`,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 422 });
  }

  const currency = serverEnv.defaultCurrency();
  const dsProductId = serverEnv.digistoreDefaultProductId();

  // Ensure a store row exists (checkout_sessions.store_id is required).
  const { data: store } = await db
    .from("stores")
    .upsert({ shop_domain: serverEnv.shopifyStoreDomain() }, { onConflict: "shop_domain" })
    .select("id")
    .single();
  if (!store) return jsonWithCors(GENERIC_FAIL, origin, { status: 500 });

  // Build a human-readable name + display options.
  const productName =
    variant.productTitle || input.handle || "Digital service";
  const resolvedOptions = Object.entries(input.options).map(([k, v]) => ({
    groupLabel: k,
    label: v,
  }));

  // 2. Persist checkout session (server-authoritative record).
  const { data: session, error: sessErr } = await db
    .from("checkout_sessions")
    .insert({
      store_id: store.id,
      service_template_id: null,
      shopify_product_id: variant.productId,
      shopify_variant_id: variant.variantId,
      selected_options: input.options,
      resolved_options: resolvedOptions,
      target_link: input.targetLink || null,
      order_notes: input.orderNotes || null,
      customer_email: input.customerEmail || null,
      calculated_price: variant.price,
      currency,
      digistore_product_id: dsProductId,
      status: "created",
      client_ip: clientIp(req),
    })
    .select("id")
    .single();

  if (sessErr || !session) {
    await logEvent({
      source: "checkout",
      level: "error",
      message: "failed to persist variant checkout session",
      payload: { err: String(sessErr) },
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 500 });
  }

  // 3. Dynamic Digistore buy URL with the Shopify price.
  const variantLabel = variant.variantTitle && variant.variantTitle !== "Default Title"
    ? ` — ${variant.variantTitle}`
    : "";
  const ds = await createBuyUrl({
    productId: dsProductId,
    amount: variant.price,
    currency,
    productName: `${productName}${variantLabel}`.slice(0, 120),
    custom: `sid:${session.id}`,
    buyerEmail: input.customerEmail || undefined,
    thankYouUrl: `${serverEnv.appBaseUrl()}/checkout/thank-you?sid=${session.id}`,
  });

  if (!ds.ok || !ds.data?.url) {
    await db.from("checkout_sessions").update({ status: "failed" }).eq("id", session.id);
    await logEvent({
      source: "checkout",
      level: "error",
      event: "createBuyUrl_failed",
      message: ds.message ?? ds.code,
      payload: { code: ds.code },
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 502 });
  }

  await db
    .from("checkout_sessions")
    .update({ digistore_buy_url: ds.data.url, status: "redirected" })
    .eq("id", session.id);

  return jsonWithCors({ ok: true, checkoutUrl: ds.data.url, sessionId: session.id }, origin);
}
