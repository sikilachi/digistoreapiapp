"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, StatusBadge, Spinner, EmptyState } from "@/components/ui";

interface Order {
  id: string;
  status: string;
  calculated_price: number;
  currency: string;
  customer_email: string | null;
  target_link: string | null;
  resolved_options: Array<{ groupLabel: string; label: string }>;
  digistore_order_id: string | null;
  shopify_order_id: string | null;
  created_at: string;
}

const FILTERS = ["all", "paid", "redirected", "created", "failed", "refunded"] as const;

export default function OrdersPage() {
  const [items, setItems] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    const qs = filter === "all" ? "" : `?status=${filter}`;
    adminFetch<{ items: Order[] }>(`/api/admin/orders${qs}`)
      .then((d) => setItems(d.items))
      .catch((e) => setErr(String(e)));
  }, [filter]);

  return (
    <>
      <PageHeader title="Orders" subtitle="Every checkout session and its payment status." />
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn text-xs ${
              filter === f ? "bg-brand-600 text-white" : "btn-ghost"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {err ? (
        <EmptyState title="Could not load orders" hint={err} />
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No orders found" hint="Orders appear here after a Buy Now click." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Options</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Digistore</th>
                <th className="px-5 py-3 font-medium">Shopify</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="border-b border-surface-border last:border-0 align-top">
                  <td className="px-5 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-muted max-w-[220px]">
                    {(o.resolved_options ?? [])
                      .map((r) => `${r.groupLabel}: ${r.label}`)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {o.currency} {Number(o.calculated_price).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-ink-muted">{o.customer_email ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{o.digistore_order_id ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{o.shopify_order_id ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted whitespace-nowrap">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
