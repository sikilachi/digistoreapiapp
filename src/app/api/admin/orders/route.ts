import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET recent checkout sessions (the unified order timeline). */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let q = db
    .from("checkout_sessions")
    .select(
      "id, status, calculated_price, currency, customer_email, target_link, resolved_options, digistore_order_id, shopify_order_id, created_at, service_template_id",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
