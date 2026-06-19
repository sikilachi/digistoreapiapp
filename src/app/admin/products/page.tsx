"use client";
import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

interface Product {
  id: string;
  shopify_product_id: string;
  handle: string;
  title: string | null;
  checkout_enabled: boolean;
  service_template_id: string | null;
}
interface Template {
  id: string;
  name: string;
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      adminFetch<{ items: Product[] }>("/api/admin/products"),
      adminFetch<{ items: Template[] }>("/api/admin/service-templates"),
    ])
      .then(([p, t]) => {
        setItems(p.items);
        setTemplates(t.items);
      })
      .catch((e) => setErr(String(e)));
  }, []);
  useEffect(load, [load]);

  async function patch(id: string, patch: Partial<Product>) {
    await adminFetch("/api/admin/products", {
      method: "PATCH",
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Map each Shopify product to a service template and toggle Digistore checkout."
      />
      {err ? (
        <EmptyState title="Could not load products" hint={err} />
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="No products synced yet"
          hint="Go to Shopify Sync and click 'Sync products'."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Handle</th>
                <th className="px-5 py-3 font-medium">Service template</th>
                <th className="px-5 py-3 font-medium">Checkout</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-3 font-medium">{p.title ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{p.handle}</td>
                  <td className="px-5 py-3">
                    <select
                      className="input max-w-[220px]"
                      value={p.service_template_id ?? ""}
                      onChange={(e) =>
                        patch(p.id, { service_template_id: e.target.value || null } as Partial<Product>)
                      }
                    >
                      <option value="">— not mapped —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.checkout_enabled}
                        onChange={(e) => patch(p.id, { checkout_enabled: e.target.checked })}
                        className="accent-brand-600 h-4 w-4"
                      />
                      <span className="text-xs text-ink-muted">
                        {p.checkout_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </label>
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
