import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sync-products
 * Pulls products from the Shopify Admin API and upserts them into
 * shopify_products so you can map each to a service template. Idempotent.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();

  // Ensure a store row exists for this shop.
  const shopDomain = serverEnv.shopifyStoreDomain();
  const { data: store } = await db
    .from("stores")
    .upsert({ shop_domain: shopDomain }, { onConflict: "shop_domain" })
    .select("id")
    .single();
  if (!store) return NextResponse.json({ error: "store_init_failed" }, { status: 500 });

  const base = `https://${shopDomain}/admin/api/${serverEnv.shopifyApiVersion()}`;
  let res: Response;
  try {
    res = await fetch(`${base}/products.json?limit=250&fields=id,title,handle`, {
      headers: {
        "X-Shopify-Access-Token": serverEnv.shopifyAdminToken(),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json({ error: "shopify_unreachable", detail: String(err) }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logEvent({ source: "shopify", level: "error", event: "sync_failed", message: text, storeId: store.id });
    return NextResponse.json({ error: "shopify_error", status: res.status, detail: text }, { status: 502 });
  }

  const json = (await res.json()) as { products?: Array<{ id: number; title: string; handle: string }> };
  const products = json.products ?? [];

  const rows = products.map((p) => ({
    store_id: store.id,
    shopify_product_id: String(p.id),
    handle: p.handle,
    title: p.title,
  }));

  if (rows.length) {
    await db.from("shopify_products").upsert(rows, {
      onConflict: "store_id,shopify_product_id",
      ignoreDuplicates: false,
    });
  }

  await logEvent({
    source: "shopify",
    level: "info",
    event: "sync_products",
    message: `Synced ${rows.length} products`,
    storeId: store.id,
  });

  return NextResponse.json({ ok: true, synced: rows.length });
}
