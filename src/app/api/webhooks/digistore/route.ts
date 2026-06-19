import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseIpn, verifyIpnSignature } from "@/lib/digistore/ipn";
import { createShopifyOrder } from "@/lib/shopify/admin";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  store_id: string;
  service_template_id: string | null;
  calculated_price: number;
  currency: string;
  provider_service_id: string | null;
  target_link: string | null;
  order_notes: string | null;
  resolved_options: Array<{ groupLabel: string; label: string }>;
  shopify_product_id: string | null;
  shopify_order_id: string | null;
}

/**
 * POST /api/webhooks/digistore
 * Digistore IPN handler. Digistore posts application/x-www-form-urlencoded.
 *
 * Flow:
 *  1. Parse form body → params.
 *  2. Verify sha_sign with the IPN passphrase.
 *  3. Correlate to a checkout_session via `custom` (sid:<uuid>).
 *  4. On paid: create a Shopify order, persist digistore_orders + shopify_orders.
 *  5. Respond with "OK" (Digistore expects a 200 plain-text ack).
 *
 * Idempotent: a unique (digistore_order_id, event) index prevents duplicate
 * Shopify orders if Digistore retries.
 */
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();

  // Digistore sends urlencoded form data.
  const rawText = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(rawText).forEach((v, k) => {
    params[k] = v;
  });

  const signatureValid = verifyIpnSignature(params, serverEnv.digistoreIpnPassphrase());
  const ipn = parseIpn(params);

  await logEvent({
    source: "digistore_ipn",
    event: ipn.event || "unknown",
    level: signatureValid ? "info" : "error",
    signatureValid,
    message: signatureValid ? "IPN received" : "IPN signature INVALID — ignored",
    payload: params,
  });

  if (!signatureValid) {
    // Do not act on unverified data. Still return 200 so Digistore doesn't hammer retries,
    // but the log marks it invalid. (Switch to 403 if you prefer hard rejection.)
    return new NextResponse("OK", { status: 200 });
  }

  // Correlate to our checkout session via custom "sid:<uuid>;...".
  let sessionId: string | null = null;
  const m = /sid:([0-9a-f-]{36})/i.exec(ipn.custom ?? "");
  if (m) sessionId = m[1] ?? null;

  let session: SessionRow | null = null;

  if (sessionId) {
    const { data } = await db
      .from("checkout_sessions")
      .select(
        "id, store_id, service_template_id, calculated_price, currency, provider_service_id, target_link, order_notes, resolved_options, shopify_product_id, shopify_order_id",
      )
      .eq("id", sessionId)
      .maybeSingle();
    session = (data as unknown as SessionRow | null) ?? null;
  }

  // Record the Digistore order event (idempotent on order_id+event).
  await db
    .from("digistore_orders")
    .upsert(
      {
        store_id: session?.store_id ?? null,
        checkout_session_id: session?.id ?? null,
        digistore_order_id: ipn.orderId,
        event: ipn.event,
        billing_status: ipn.billingStatus,
        amount: ipn.amount,
        currency: ipn.currency,
        buyer_email: ipn.email,
        buyer_first_name: ipn.firstName,
        buyer_last_name: ipn.lastName,
        product_name: ipn.productName,
        raw_payload: params,
      },
      { onConflict: "digistore_order_id,event", ignoreDuplicates: true },
    );

  // Handle refunds / chargebacks: mark session, don't create orders.
  if (ipn.event === "on_refund" || ipn.billingStatus.toLowerCase() === "refunded") {
    if (session) {
      await db
        .from("checkout_sessions")
        .update({ status: "refunded", digistore_order_id: ipn.orderId })
        .eq("id", session.id);
    }
    return new NextResponse("OK", { status: 200 });
  }

  // Only create a Shopify order on a paid event.
  if (!ipn.isPaid) {
    if (session) {
      await db
        .from("checkout_sessions")
        .update({ digistore_order_id: ipn.orderId })
        .eq("id", session.id);
    }
    return new NextResponse("OK", { status: 200 });
  }

  // Guard against duplicate Shopify orders.
  if (session?.shopify_order_id) {
    return new NextResponse("OK", { status: 200 });
  }

  // Build the Shopify order from the authoritative session (fallback to IPN data).
  const serviceName = ipn.productName ?? "Digital service";
  const price = session?.calculated_price ?? ipn.amount ?? 0;
  const currency = session?.currency ?? ipn.currency ?? serverEnv.defaultCurrency();
  const optionLines =
    session?.resolved_options?.map((o) => ({ label: o.groupLabel, value: o.label })) ?? [];

  const orderResult = await createShopifyOrder({
    email: ipn.email,
    firstName: ipn.firstName,
    lastName: ipn.lastName,
    serviceName: session ? serviceName : serviceName,
    price: Number(price),
    currency,
    optionLines,
    targetLink: session?.target_link ?? null,
    orderNotes: session?.order_notes ?? null,
    digistoreOrderId: ipn.orderId,
    providerServiceId: session?.provider_service_id ?? null,
    shopifyProductId: session?.shopify_product_id ?? null,
  });

  if (!orderResult.ok) {
    await logEvent({
      source: "shopify",
      level: "error",
      event: "create_order_failed",
      message: orderResult.error,
      storeId: session?.store_id ?? null,
      payload: { digistoreOrderId: ipn.orderId, status: orderResult.status },
    });
    // Still ack 200 to avoid retry storms; the failure is logged for manual retry.
    return new NextResponse("OK", { status: 200 });
  }

  // Persist shopify_orders + flip session to paid.
  await db.from("shopify_orders").upsert(
    {
      store_id: session?.store_id ?? null,
      checkout_session_id: session?.id ?? null,
      shopify_order_id: orderResult.orderId!,
      shopify_order_name: orderResult.orderName ?? null,
      digistore_order_id: ipn.orderId,
      status: "paid",
      total_price: Number(price),
      currency,
    },
    { onConflict: "store_id,shopify_order_id", ignoreDuplicates: true },
  );

  if (session) {
    await db
      .from("checkout_sessions")
      .update({
        status: "paid",
        digistore_order_id: ipn.orderId,
        shopify_order_id: orderResult.orderId,
      })
      .eq("id", session.id);
  }

  await logEvent({
    source: "shopify",
    level: "info",
    event: "order_created",
    message: `Shopify order ${orderResult.orderName} created for DS ${ipn.orderId}`,
    storeId: session?.store_id ?? null,
  });

  return new NextResponse("OK", { status: 200 });
}

// Digistore can send a GET "ping" when configuring the IPN; respond 200.
export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
