import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET recent webhook/system logs, optionally filtered by source/level. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const level = searchParams.get("level");

  let q = db
    .from("webhook_logs")
    .select("id, source, event, level, signature_valid, message, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (source) q = q.eq("source", source);
  if (level) q = q.eq("level", level);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
