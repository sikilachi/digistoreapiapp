/** Shared domain types mirroring the Supabase schema (the fields the app uses). */

export type PricingRole = "multiplier" | "tier" | "surcharge" | "none";
export type InputType = "select" | "radio" | "number" | "text";
export type CheckoutStatus =
  | "created"
  | "redirected"
  | "paid"
  | "failed"
  | "refunded"
  | "expired";
export type PricingRuleType =
  | "combo_override"
  | "discount_pct"
  | "discount_flat"
  | "surcharge_flat"
  | "min_price"
  | "campaign_price";

export interface ServiceTemplate {
  id: string;
  store_id: string;
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

export interface OptionGroup {
  id: string;
  service_template_id: string;
  key: string;
  label: string;
  input_type: InputType;
  pricing_role: PricingRole;
  is_required: boolean;
  sort_order: number;
}

export interface OptionValue {
  id: string;
  option_group_id: string;
  value: string;
  label: string;
  multiplier: number;
  surcharge: number;
  tier_quantity: number | null;
  tier_unit_price: number | null;
  tier_flat_price: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface PricingRule {
  id: string;
  service_template_id: string;
  name: string;
  rule_type: PricingRuleType;
  match_options: Record<string, string>;
  amount: number | null;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export interface ProviderMapping {
  id: string;
  service_template_id: string;
  provider_name: string | null;
  provider_service_id: string;
  match_options: Record<string, string>;
  is_active: boolean;
}

/** A group + its values, as sent to the storefront widget. */
export interface OptionGroupWithValues extends OptionGroup {
  values: OptionValue[];
}

/** Full config the storefront needs to render the form. No prices-by-combo leak. */
export interface StorefrontConfig {
  service: Pick<
    ServiceTemplate,
    "id" | "name" | "slug" | "currency" | "requires_link" | "link_label" | "allow_notes"
  > & { checkout_enabled: boolean };
  groups: OptionGroupWithValues[];
}

/** Result of a server-side price calculation. */
export interface PriceBreakdownStep {
  label: string;
  detail: string;
  amount: number;
}

export interface PriceResult {
  currency: string;
  finalPrice: number;
  basePrice: number;
  steps: PriceBreakdownStep[];
  resolvedOptions: Array<{ groupKey: string; groupLabel: string; value: string; label: string }>;
  serviceName: string;
  providerServiceId: string | null;
}
