"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

interface Settings {
  digistore: { apiKey: boolean; ipnPassphrase: boolean; ipnUrl: string; currency: string };
  shopify: { adminToken: boolean; storeDomain: string; apiVersion: string };
  supabase: { url: boolean; serviceRole: boolean };
  app: { baseUrl: string; allowedOrigins: string };
}

function Status({ ok }: { ok: boolean }) {
  return ok ? <span className="badge-green">Configured</span> : <span className="badge-red">Missing</span>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-border last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Settings>("/api/admin/settings").then(setS).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <EmptyState title="Could not load settings" hint={err} />;
  if (!s) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Digistore Settings"
        subtitle="Credentials are stored as environment variables (never in the browser). This page only reports their status."
      />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">Digistore24</h2>
          <Row label="API key" value={<Status ok={s.digistore.apiKey} />} />
          <Row label="IPN passphrase" value={<Status ok={s.digistore.ipnPassphrase} />} />
          <Row label="Default currency" value={s.digistore.currency} />
          <div className="mt-4">
            <p className="label">IPN / Webhook URL (paste into Digistore)</p>
            <code className="block text-xs bg-surface-soft rounded-lg p-3 break-all">
              {s.digistore.ipnUrl}
            </code>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">Shopify</h2>
          <Row label="Admin API token" value={<Status ok={s.shopify.adminToken} />} />
          <Row label="Store domain" value={s.shopify.storeDomain || "—"} />
          <Row label="API version" value={s.shopify.apiVersion} />
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">Supabase</h2>
          <Row label="Project URL" value={<Status ok={s.supabase.url} />} />
          <Row label="Service-role key" value={<Status ok={s.supabase.serviceRole} />} />
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-3">App</h2>
          <Row label="Base URL" value={s.app.baseUrl || "—"} />
          <Row label="Allowed storefront origins" value={s.app.allowedOrigins || "—"} />
        </div>
      </div>
    </>
  );
}
