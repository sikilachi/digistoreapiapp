import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/overview — dashboard counts + recent activity. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const db = supabaseAdmin();

  const headCount = (table: string) =>
    db.from(table).select("*", { count: "exact", head: true });

  const [services, products, paidSessions, allSessions, errorLogs, recentOrders] =
    await Promise.all([
      headCount("service_templates"),
      headCount("shopify_products"),
      db
        .from("checkout_sessions")
        .select("calculated_price,currency", { count: "exact" })
        .eq("status", "paid"),
      headCount("checkout_sessions"),
      db.from("webhook_logs").select("*", { count: "exact", head: true }).eq("level", "error"),
      db
        .from("shopify_orders")
        .select("shopify_order_name, total_price, currency, digistore_order_id, created_at, status")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const revenue = (paidSessions.data ?? []).reduce(
    (sum, s) => sum + Number(s.calculated_price ?? 0),
    0,
  );

  return NextResponse.json({
    stats: {
      services: services.count ?? 0,
      products: products.count ?? 0,
      paidOrders: paidSessions.count ?? 0,
      totalSessions: allSessions.count ?? 0,
      errors: errorLogs.count ?? 0,
      revenue: Math.round(revenue * 100) / 100,
    },
    recentOrders: recentOrders.data ?? [],
  });
}
