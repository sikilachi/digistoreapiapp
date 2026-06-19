import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  OptionGroup,
  OptionValue,
  PricingRule,
  ProviderMapping,
  ServiceTemplate,
} from "@/lib/types";
import type { PricingInputs } from "@/lib/pricing/engine";

export interface LoadedService {
  service: ServiceTemplate;
  groups: OptionGroup[];
  values: OptionValue[];
  rules: PricingRule[];
  providerMappings: ProviderMapping[];
}

/** Load a service template (by id or slug within a store) with all pricing data. */
export async function loadServiceForPricing(opts: {
  storeId?: string;
  serviceId?: string;
  slug?: string;
}): Promise<LoadedService | null> {
  const db = supabaseAdmin();

  let query = db.from("service_templates").select("*").limit(1);
  if (opts.serviceId) query = query.eq("id", opts.serviceId);
  if (opts.slug) query = query.eq("slug", opts.slug);
  if (opts.storeId) query = query.eq("store_id", opts.storeId);

  const { data: service, error } = await query.maybeSingle();
  if (error) throw error;
  if (!service) return null;

  const [{ data: groups }, { data: rules }, { data: providerMappings }] = await Promise.all([
    db.from("option_groups").select("*").eq("service_template_id", service.id).order("sort_order"),
    db.from("pricing_rules").select("*").eq("service_template_id", service.id),
    db.from("provider_mappings").select("*").eq("service_template_id", service.id),
  ]);

  const groupIds = (groups ?? []).map((g) => g.id);
  let values: OptionValue[] = [];
  if (groupIds.length > 0) {
    const { data: vals } = await db
      .from("option_values")
      .select("*")
      .in("option_group_id", groupIds)
      .order("sort_order");
    values = (vals ?? []) as OptionValue[];
  }

  return {
    service: service as ServiceTemplate,
    groups: (groups ?? []) as OptionGroup[],
    values,
    rules: (rules ?? []) as PricingRule[],
    providerMappings: (providerMappings ?? []) as ProviderMapping[],
  };
}

export function toPricingInputs(
  loaded: LoadedService,
  selected: Record<string, string>,
): PricingInputs {
  return { ...loaded, selected };
}
