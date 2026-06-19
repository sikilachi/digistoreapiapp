import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET list of service templates. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("service_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** PATCH update settings on a template (digistore product id, prices, toggle). */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { id?: string; patch?: Record<string, unknown> }
    | null;
  if (!body?.id || !body.patch) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // Whitelist editable fields.
  const allowed = [
    "name",
    "description",
    "base_price",
    "currency",
    "min_price",
    "requires_link",
    "link_label",
    "allow_notes",
    "digistore_product_id",
    "checkout_enabled",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body.patch) patch[k] = body.patch[k];

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("service_templates")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
