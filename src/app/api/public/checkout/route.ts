import { NextRequest } from "next/server";
import { clientIp, jsonWithCors, preflight } from "@/lib/http";
import { checkoutRequestSchema } from "@/lib/validation";
import { loadServiceForPricing, toPricingInputs } from "@/lib/pricing/loader";
import { calculatePrice, PricingError } from "@/lib/pricing/engine";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createBuyUrl } from "@/lib/digistore/client";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer-safe generic failure message. We never leak internals to the storefront.
const GENERIC_FAIL = {
  error: "checkout_failed",
  message: "Checkout could not be created. Please contact support.",
};

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * POST /api/public/checkout
 * 1. Validate input.
 * 2. Recalculate price server-side (anti-tampering).
 * 3. Persist a checkout_session (authoritative record).
 * 4. Call Digistore createBuyUrl with the dynamic price + session id as `custom`.
 * 5. Return the buy URL for the browser to redirect to.
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

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors({ error: "invalid_request" }, origin, { status: 400 });
  }
  const input = parsed.data;
  if (!input.serviceId && !input.slug) {
    return jsonWithCors({ error: "missing_service" }, origin, { status: 400 });
  }

  const loaded = await loadServiceForPricing({ serviceId: input.serviceId, slug: input.slug });
  if (!loaded) {
    return jsonWithCors({ error: "service_not_found" }, origin, { status: 404 });
  }
  const { service } = loaded;

  // Master switch: checkout must be enabled for this service.
  if (!service.checkout_enabled) {
    return jsonWithCors(GENERIC_FAIL, origin, { status: 403 });
  }

  // Require a target link if the service needs one.
  if (service.requires_link && (!input.targetLink || input.targetLink.trim() === "")) {
    return jsonWithCors(
      { error: "missing_link", message: `${service.link_label ?? "Target link"} is required.` },
      origin,
      { status: 422 },
    );
  }

  // 2. Recalculate price + resolve provider id, server-side.
  let price;
  try {
    price = calculatePrice(toPricingInputs(loaded, input.options));
  } catch (err) {
    if (err instanceof PricingError) {
      return jsonWithCors({ error: err.code, message: err.message }, origin, { status: 422 });
    }
    await logEvent({
      source: "checkout",
      level: "error",
      message: "price calculation failed",
      payload: { err: String(err) },
      storeId: service.store_id,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 500 });
  }

  if (!service.digistore_product_id) {
    await logEvent({
      source: "checkout",
      level: "error",
      event: "missing_ds_product",
      message: `Service ${service.slug} has no digistore_product_id`,
      storeId: service.store_id,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 500 });
  }

  // 3. Persist checkout session (status: created).
  const { data: session, error: sessErr } = await db
    .from("checkout_sessions")
    .insert({
      store_id: service.store_id,
      service_template_id: service.id,
      shopify_product_id: input.shopifyProductId ?? null,
      shopify_variant_id: input.shopifyVariantId ?? null,
      selected_options: input.options,
      resolved_options: price.resolvedOptions,
      target_link: input.targetLink || null,
      order_notes: input.orderNotes || null,
      customer_email: input.customerEmail || null,
      calculated_price: price.finalPrice,
      currency: price.currency,
      provider_service_id: price.providerServiceId,
      digistore_product_id: service.digistore_product_id,
      status: "created",
      client_ip: clientIp(req),
    })
    .select("id")
    .single();

  if (sessErr || !session) {
    await logEvent({
      source: "checkout",
      level: "error",
      message: "failed to persist checkout session",
      payload: { err: String(sessErr) },
      storeId: service.store_id,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 500 });
  }

  // 4. Create the Digistore buy URL with the dynamic price.
  // `custom` carries our session id so the IPN can correlate the payment.
  const customSummary = price.resolvedOptions.map((o) => `${o.groupKey}=${o.value}`).join("|");
  const ds = await createBuyUrl({
    productId: service.digistore_product_id,
    amount: price.finalPrice,
    currency: price.currency,
    productName: service.name,
    custom: `sid:${session.id};${customSummary}`.slice(0, 250),
    buyerEmail: input.customerEmail || undefined,
    thankYouUrl: `${serverEnv.appBaseUrl()}/checkout/thank-you?sid=${session.id}`,
  });

  if (!ds.ok || !ds.data?.url) {
    await db
      .from("checkout_sessions")
      .update({ status: "failed" })
      .eq("id", session.id);
    await logEvent({
      source: "checkout",
      level: "error",
      event: "createBuyUrl_failed",
      message: ds.message ?? ds.code,
      payload: { code: ds.code, message: ds.message },
      storeId: service.store_id,
    });
    return jsonWithCors(GENERIC_FAIL, origin, { status: 502 });
  }

  // 5. Save the URL + mark redirected.
  await db
    .from("checkout_sessions")
    .update({ digistore_buy_url: ds.data.url, status: "redirected" })
    .eq("id", session.id);

  return jsonWithCors(
    { ok: true, checkoutUrl: ds.data.url, sessionId: session.id },
    origin,
  );
}
