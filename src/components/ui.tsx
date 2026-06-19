"use client";
import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold mt-2">{value}</p>
      {hint && <p className="text-xs text-ink-subtle mt-1">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "badge-green",
    redirected: "badge-amber",
    created: "badge-gray",
    failed: "badge-red",
    refunded: "badge-red",
    expired: "badge-gray",
    info: "badge-green",
    warn: "badge-amber",
    error: "badge-red",
  };
  return <span className={map[status] ?? "badge-gray"}>{status}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="text-sm text-ink-muted mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-ink-muted text-sm">Loading…</div>
  );
}
