"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, StatCard, StatusBadge, Spinner, EmptyState } from "@/components/ui";

interface Overview {
  stats: {
    services: number;
    products: number;
    paidOrders: number;
    totalSessions: number;
    errors: number;
    revenue: number;
  };
  recentOrders: Array<{
    shopify_order_name: string | null;
    total_price: number | null;
    currency: string | null;
    digistore_order_id: string | null;
    created_at: string;
    status: string | null;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Overview>("/api/admin/overview").then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <EmptyState title="Could not load dashboard" hint={err} />;
  if (!data) return <Spinner />;

  const { stats, recentOrders } = data;
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your Digistore checkout bridge."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Paid orders" value={stats.paidOrders} />
        <StatCard label="Revenue" value={`€${stats.revenue.toFixed(2)}`} hint="Paid sessions" />
        <StatCard label="Checkout sessions" value={stats.totalSessions} />
        <StatCard label="Services" value={stats.services} />
        <StatCard label="Synced products" value={stats.products} />
        <StatCard
          label="Errors (logs)"
          value={stats.errors}
          hint={stats.errors > 0 ? "Check Logs" : "All clear"}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent orders</h2>
          <Link href="/admin/orders" className="text-xs text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No orders yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Digistore ID</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o, i) => (
                <tr key={i} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-3 font-medium">{o.shopify_order_name ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{o.digistore_order_id ?? "—"}</td>
                  <td className="px-5 py-3">
                    {o.total_price != null ? `${o.currency ?? "€"} ${Number(o.total_price).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={o.status ?? "—"} />
                  </td>
                  <td className="px-5 py-3 text-ink-muted">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
