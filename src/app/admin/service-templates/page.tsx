"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

interface Template {
  id: string;
  name: string;
  slug: string;
  currency: string;
  base_price: number;
  min_price: number;
  digistore_product_id: string | null;
  checkout_enabled: boolean;
}

export default function ServiceTemplatesPage() {
  const [items, setItems] = useState<Template[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ items: Template[] }>("/api/admin/service-templates")
      .then((d) => setItems(d.items))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <>
      <PageHeader
        title="Service Templates"
        subtitle="Each template defines a service, its option groups, pricing, and provider mapping."
      />
      {err ? (
        <EmptyState title="Could not load templates" hint={err} />
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="No service templates yet"
          hint="Seed one via supabase/migrations/0002_seed_mvp.sql or create via SQL."
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((t) => (
            <Link key={t.id} href={`/admin/service-templates/${t.id}`} className="card p-5 hover:shadow-pop transition-shadow">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                {t.checkout_enabled ? (
                  <span className="badge-green">Live</span>
                ) : (
                  <span className="badge-gray">Off</span>
                )}
              </div>
              <p className="text-xs text-ink-subtle mt-1">/{t.slug}</p>
              <div className="flex gap-4 mt-3 text-xs text-ink-muted">
                <span>Min {t.currency} {Number(t.min_price).toFixed(2)}</span>
                <span>
                  DS product:{" "}
                  {t.digistore_product_id ? (
                    <span className="text-ink">{t.digistore_product_id}</span>
                  ) : (
                    <span className="text-red-600">not set</span>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
