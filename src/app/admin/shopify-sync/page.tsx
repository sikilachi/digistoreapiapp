"use client";
import { useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader } from "@/components/ui";

export default function ShopifySyncPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await adminFetch<{ ok: boolean; synced: number }>("/api/admin/sync-products", {
        method: "POST",
      });
      setResult(`Synced ${r.synced} products from Shopify.`);
    } catch (e) {
      setError(
        "Sync failed. Check that SHOPIFY_ADMIN_API_TOKEN, SHOPIFY_STORE_DOMAIN and read_products scope are set.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Shopify Sync"
        subtitle="Pull products from your Shopify store so you can map them to services."
      />
      <div className="card p-6 max-w-xl space-y-4">
        <p className="text-sm text-ink-muted">
          This calls the Shopify Admin API and upserts your products into the bridge. Run it again
          whenever you add new products. It does not modify anything in Shopify.
        </p>
        <button className="btn-primary" onClick={sync} disabled={busy}>
          {busy ? "Syncing…" : "Sync products"}
        </button>
        {result && <p className="text-sm text-brand-700">{result}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </>
  );
}
