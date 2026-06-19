import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET synced Shopify products + their service template mapping. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("shopify_products")
    .select("id, shopify_product_id, handle, title, checkout_enabled, service_template_id")
    .order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** PATCH map a product to a service template / toggle checkout. */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { id?: string; service_template_id?: string | null; checkout_enabled?: boolean }
    | null;
  if (!body?.id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("service_template_id" in body) patch.service_template_id = body.service_template_id;
  if ("checkout_enabled" in body) patch.checkout_enabled = body.checkout_enabled;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("shopify_products")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
