import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { jsonWithCors, preflight } from "@/lib/http";
import type { OptionGroupWithValues, StorefrontConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/public/config/:handle
 * Returns the service form configuration for a Shopify product handle.
 * Resolves product → service template → option groups + values.
 * Does NOT return pricing rules or per-combination prices.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ handle: string }> },
) {
  const origin = req.headers.get("origin");
  const { handle } = await ctx.params;
  const db = supabaseAdmin();

  // Find the mapped product (by handle) and its service template.
  const { data: product } = await db
    .from("shopify_products")
    .select("id, service_template_id, checkout_enabled, store_id")
    .eq("handle", handle)
    .maybeSingle();

  // Resolve the service template: via mapped product, or directly by slug == handle.
  let serviceId = product?.service_template_id ?? null;
  if (!serviceId) {
    const { data: bySlug } = await db
      .from("service_templates")
      .select("id")
      .eq("slug", handle)
      .maybeSingle();
    serviceId = bySlug?.id ?? null;
  }

  if (!serviceId) {
    return jsonWithCors({ enabled: false, reason: "not_configured" }, origin, { status: 404 });
  }

  const { data: service } = await db
    .from("service_templates")
    .select(
      "id, name, slug, currency, requires_link, link_label, allow_notes, checkout_enabled",
    )
    .eq("id", serviceId)
    .maybeSingle();

  if (!service) {
    return jsonWithCors({ enabled: false, reason: "not_configured" }, origin, { status: 404 });
  }

  const productEnabled = product ? product.checkout_enabled : true;
  const enabled = service.checkout_enabled && productEnabled;

  const { data: groups } = await db
    .from("option_groups")
    .select("*")
    .eq("service_template_id", service.id)
    .order("sort_order");

  const groupIds = (groups ?? []).map((g) => g.id);
  let valuesByGroup: Record<string, unknown[]> = {};
  if (groupIds.length > 0) {
    const { data: values } = await db
      .from("option_values")
      .select(
        "id, option_group_id, value, label, is_default, is_active, sort_order, tier_quantity",
      )
      .in("option_group_id", groupIds)
      .eq("is_active", true)
      .order("sort_order");
    valuesByGroup = (values ?? []).reduce<Record<string, unknown[]>>((acc, v) => {
      (acc[v.option_group_id] ??= []).push(v);
      return acc;
    }, {});
  }

  const groupsWithValues: OptionGroupWithValues[] = (groups ?? []).map((g) => ({
    ...g,
    // Strip pricing fields from values — storefront only needs labels/values.
    values: ((valuesByGroup[g.id] ?? []) as OptionGroupWithValues["values"]) ?? [],
  }));

  const config: StorefrontConfig & { enabled: boolean } = {
    enabled,
    service: {
      id: service.id,
      name: service.name,
      slug: service.slug,
      currency: service.currency,
      requires_link: service.requires_link,
      link_label: service.link_label,
      allow_notes: service.allow_notes,
      checkout_enabled: service.checkout_enabled,
    },
    groups: groupsWithValues,
  };

  return jsonWithCors(config, origin);
}
