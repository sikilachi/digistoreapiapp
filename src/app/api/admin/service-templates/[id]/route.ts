import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET a service template with its option groups/values, pricing rules, mappings. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: service } = await db.from("service_templates").select("*").eq("id", id).maybeSingle();
  if (!service) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ data: groups }, { data: rules }, { data: mappings }] = await Promise.all([
    db.from("option_groups").select("*").eq("service_template_id", id).order("sort_order"),
    db.from("pricing_rules").select("*").eq("service_template_id", id).order("priority"),
    db.from("provider_mappings").select("*").eq("service_template_id", id),
  ]);

  const groupIds = (groups ?? []).map((g) => g.id);
  let values: unknown[] = [];
  if (groupIds.length) {
    const { data } = await db
      .from("option_values")
      .select("*")
      .in("option_group_id", groupIds)
      .order("sort_order");
    values = data ?? [];
  }

  return NextResponse.json({ service, groups: groups ?? [], values, rules: rules ?? [], mappings: mappings ?? [] });
}
