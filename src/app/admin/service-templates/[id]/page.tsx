"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { adminFetch } from "@/lib/admin-fetch";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  currency: string;
  min_price: number;
  requires_link: boolean;
  link_label: string | null;
  allow_notes: boolean;
  digistore_product_id: string | null;
  checkout_enabled: boolean;
}
interface Group {
  id: string;
  key: string;
  label: string;
  input_type: string;
  pricing_role: string;
  is_required: boolean;
}
interface Value {
  id: string;
  option_group_id: string;
  value: string;
  label: string;
  multiplier: number;
  surcharge: number;
  tier_flat_price: number | null;
  tier_unit_price: number | null;
  tier_quantity: number | null;
}
interface Rule {
  id: string;
  name: string;
  rule_type: string;
  amount: number | null;
  priority: number;
  is_active: boolean;
}
interface Mapping {
  id: string;
  provider_name: string | null;
  provider_service_id: string;
  match_options: Record<string, string>;
}
interface Detail {
  service: Service;
  groups: Group[];
  values: Value[];
  rules: Rule[];
  mappings: Mapping[];
}

export default function ServiceTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    adminFetch<Detail>(`/api/admin/service-templates/${id}`)
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, [id]);
  useEffect(load, [load]);

  if (err) return <EmptyState title="Could not load template" hint={err} />;
  if (!data) return <Spinner />;
  const { service, groups, values, rules, mappings } = data;

  return (
    <>
      <PageHeader title={service.name} subtitle={`/${service.slug}`} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SettingsCard service={service} onSaved={load} />
          <OptionGroupsCard groups={groups} values={values} />
          <RulesCard rules={rules} currency={service.currency} />
          <MappingsCard mappings={mappings} />
        </div>
        <div className="lg:col-span-1">
          <TestCheckoutCard serviceId={service.id} groups={groups} values={values} />
        </div>
      </div>
    </>
  );
}

function SettingsCard({ service, onSaved }: { service: Service; onSaved: () => void }) {
  const [form, setForm] = useState(service);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await adminFetch("/api/admin/service-templates", {
        method: "PATCH",
        body: JSON.stringify({
          id: service.id,
          patch: {
            digistore_product_id: form.digistore_product_id,
            base_price: Number(form.base_price),
            min_price: Number(form.min_price),
            currency: form.currency,
            requires_link: form.requires_link,
            link_label: form.link_label,
            allow_notes: form.allow_notes,
            checkout_enabled: form.checkout_enabled,
          },
        }),
      });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="text-sm font-semibold">Settings</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Digistore product ID</label>
          <input
            className="input"
            value={form.digistore_product_id ?? ""}
            placeholder="e.g. 123456"
            onChange={(e) => setForm({ ...form, digistore_product_id: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Currency</label>
          <input
            className="input"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Base price</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.base_price}
            onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Minimum price</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.min_price}
            onChange={(e) => setForm({ ...form, min_price: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Link label</label>
          <input
            className="input"
            value={form.link_label ?? ""}
            onChange={(e) => setForm({ ...form, link_label: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-600 h-4 w-4"
            checked={form.requires_link}
            onChange={(e) => setForm({ ...form, requires_link: e.target.checked })}
          />
          Requires target link
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-600 h-4 w-4"
            checked={form.allow_notes}
            onChange={(e) => setForm({ ...form, allow_notes: e.target.checked })}
          />
          Allow order notes
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="accent-brand-600 h-4 w-4"
            checked={form.checkout_enabled}
            onChange={(e) => setForm({ ...form, checkout_enabled: e.target.checked })}
          />
          Checkout enabled (live)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {msg && <span className="text-sm text-ink-muted">{msg}</span>}
      </div>
    </div>
  );
}

function OptionGroupsCard({ groups, values }: { groups: Group[]; values: Value[] }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold mb-3">Option groups</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">No option groups. Add via SQL/seed (UI editor is phase 2).</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="border border-surface-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm">{g.label}</span>
                  <span className="text-xs text-ink-subtle ml-2">({g.key})</span>
                </div>
                <div className="flex gap-2">
                  <span className="badge-gray">{g.input_type}</span>
                  <span className="badge-green">{g.pricing_role}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {values
                  .filter((v) => v.option_group_id === g.id)
                  .map((v) => (
                    <span key={v.id} className="badge-gray" title={priceHint(g.pricing_role, v)}>
                      {v.label} · {priceHint(g.pricing_role, v)}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function priceHint(role: string, v: Value): string {
  if (role === "tier") {
    if (v.tier_flat_price != null) return `€${Number(v.tier_flat_price).toFixed(2)}`;
    if (v.tier_unit_price != null && v.tier_quantity != null)
      return `€${(Number(v.tier_unit_price) * Number(v.tier_quantity)).toFixed(2)}`;
  }
  if (role === "multiplier") return `×${Number(v.multiplier)}`;
  if (role === "surcharge") return `+€${Number(v.surcharge).toFixed(2)}`;
  return "—";
}

function RulesCard({ rules, currency }: { rules: Rule[]; currency: string }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold mb-3">Pricing rules</h2>
      {rules.length === 0 ? (
        <p className="text-sm text-ink-muted">No extra pricing rules.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Amount</th>
              <th className="py-2 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-surface-border last:border-0">
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-ink-muted">{r.rule_type}</td>
                <td className="py-2">{r.amount != null ? `${currency} ${r.amount}` : "—"}</td>
                <td className="py-2 text-ink-muted">{r.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MappingsCard({ mappings }: { mappings: Mapping[] }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold mb-3">Provider mappings</h2>
      {mappings.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No provider mappings. (Phase 2: auto-dispatch to SMM provider.)
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted border-b border-surface-border">
              <th className="py-2 font-medium">Provider</th>
              <th className="py-2 font-medium">Service ID</th>
              <th className="py-2 font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="border-b border-surface-border last:border-0">
                <td className="py-2">{m.provider_name ?? "—"}</td>
                <td className="py-2">{m.provider_service_id}</td>
                <td className="py-2 text-ink-muted">{JSON.stringify(m.match_options)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TestCheckoutCard({
  serviceId,
  groups,
  values,
}: {
  serviceId: string;
  groups: Group[];
  values: Value[];
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [callDS, setCallDS] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await adminFetch("/api/admin/test-checkout", {
        method: "POST",
        body: JSON.stringify({ serviceId, options: selected, callDigistore: callDS }),
      });
      setResult(r);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6 sticky top-8">
      <h2 className="text-sm font-semibold mb-3">Test checkout</h2>
      <p className="text-xs text-ink-muted mb-4">
        Run the pricing engine for a combination, and optionally call Digistore createBuyUrl.
      </p>
      <div className="space-y-3">
        {groups.map((g) => {
          const gv = values.filter((v) => v.option_group_id === g.id);
          return (
            <div key={g.id}>
              <label className="label">{g.label}</label>
              {g.input_type === "select" || g.input_type === "radio" ? (
                <select
                  className="input"
                  value={selected[g.key] ?? ""}
                  onChange={(e) => setSelected({ ...selected, [g.key]: e.target.value })}
                >
                  <option value="">—</option>
                  {gv.map((v) => (
                    <option key={v.id} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={selected[g.key] ?? ""}
                  onChange={(e) => setSelected({ ...selected, [g.key]: e.target.value })}
                />
              )}
            </div>
          );
        })}
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-brand-600 h-4 w-4"
            checked={callDS}
            onChange={(e) => setCallDS(e.target.checked)}
          />
          Also call Digistore createBuyUrl
        </label>
        <button className="btn-primary w-full" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run test"}
        </button>
      </div>
      {result != null && (
        <pre className="mt-4 text-[11px] bg-surface-soft rounded-lg p-3 overflow-x-auto max-h-80">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
