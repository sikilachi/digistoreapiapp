"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, StatusBadge, Spinner, EmptyState } from "@/components/ui";

interface LogRow {
  id: string;
  source: string;
  event: string | null;
  level: string;
  signature_valid: boolean | null;
  message: string | null;
  created_at: string;
}

export default function LogsPage() {
  const [items, setItems] = useState<LogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    setItems(null);
    adminFetch<{ items: LogRow[] }>("/api/admin/logs")
      .then((d) => setItems(d.items))
      .catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  return (
    <>
      <PageHeader
        title="Logs"
        subtitle="Webhook (IPN), Shopify sync, and checkout events."
        action={
          <button className="btn-ghost text-xs" onClick={load}>
            Refresh
          </button>
        }
      />
      {err ? (
        <EmptyState title="Could not load logs" hint={err} />
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No logs yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                <th className="px-5 py-3 font-medium">Level</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Signature</th>
                <th className="px-5 py-3 font-medium">Message</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-b border-surface-border last:border-0 align-top">
                  <td className="px-5 py-3">
                    <StatusBadge status={l.level} />
                  </td>
                  <td className="px-5 py-3 text-ink-muted">{l.source}</td>
                  <td className="px-5 py-3 text-ink-muted">{l.event ?? "—"}</td>
                  <td className="px-5 py-3">
                    {l.signature_valid == null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : l.signature_valid ? (
                      <span className="badge-green">valid</span>
                    ) : (
                      <span className="badge-red">invalid</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-muted max-w-[360px] truncate" title={l.message ?? ""}>
                    {l.message ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-muted whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString()}
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
