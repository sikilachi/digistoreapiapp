/**
 * Pricing engine — server-side ONLY source of truth for price.
 *
 * The storefront sends option *selections* (e.g. { quantity: "1000", country: "DE" }).
 * This module loads the service's option groups/values + pricing rules and
 * computes the final price from scratch. The browser-submitted price (if any)
 * is never trusted.
 *
 * Calculation order:
 *   1. Start from base = sum of tier-group prices (quantity tiers) + base_price.
 *   2. Add surcharge-group surcharges + surcharge option values.
 *   3. Apply multiplier-group multipliers (country, gender, quality, refill...).
 *   4. Apply pricing_rules in priority order (overrides, campaigns, discounts,
 *      flat surcharges, then min_price as a floor).
 *   5. Clamp to service.min_price. Round to 2 decimals.
 */
import type {
  OptionGroup,
  OptionValue,
  PriceBreakdownStep,
  PriceResult,
  PricingRule,
  ProviderMapping,
  ServiceTemplate,
} from "@/lib/types";

export interface PricingInputs {
  service: ServiceTemplate;
  groups: OptionGroup[];
  values: OptionValue[];
  rules: PricingRule[];
  providerMappings: ProviderMapping[];
  selected: Record<string, string>; // { groupKey: optionValue }
}

export class PricingError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Does a rule's match_options match the customer's selections? */
function matchesSelection(
  match: Record<string, string>,
  selected: Record<string, string>,
): boolean {
  // Empty match = applies to everyone.
  return Object.entries(match).every(([k, v]) => selected[k] === v);
}

export function calculatePrice(inputs: PricingInputs): PriceResult {
  const { service, groups, values, rules, providerMappings, selected } = inputs;
  const currency = service.currency || "EUR";
  const steps: PriceBreakdownStep[] = [];
  const resolvedOptions: PriceResult["resolvedOptions"] = [];

  // Index values by group for quick lookup.
  const valuesByGroup = new Map<string, OptionValue[]>();
  for (const v of values) {
    if (!v.is_active) continue;
    const arr = valuesByGroup.get(v.option_group_id) ?? [];
    arr.push(v);
    valuesByGroup.set(v.option_group_id, arr);
  }

  // Validate required groups + resolve selected option values.
  const groupsSorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  const chosen = new Map<string, { group: OptionGroup; value: OptionValue }>();

  for (const group of groupsSorted) {
    const selectedValue = selected[group.key];
    const groupValues = valuesByGroup.get(group.id) ?? [];

    if (selectedValue === undefined || selectedValue === "") {
      if (group.is_required) {
        throw new PricingError(
          `Missing required option: ${group.label}`,
          "MISSING_OPTION",
        );
      }
      continue;
    }

    // Free-text / number groups carry no priced value object.
    if (group.input_type === "text" || group.input_type === "number") {
      resolvedOptions.push({
        groupKey: group.key,
        groupLabel: group.label,
        value: selectedValue,
        label: selectedValue,
      });
      continue;
    }

    const ov = groupValues.find((v) => v.value === selectedValue);
    if (!ov) {
      throw new PricingError(
        `Invalid value "${selectedValue}" for option ${group.label}`,
        "INVALID_OPTION",
      );
    }
    chosen.set(group.key, { group, value: ov });
    resolvedOptions.push({
      groupKey: group.key,
      groupLabel: group.label,
      value: ov.value,
      label: ov.label,
    });
  }

  // 1. Base price.
  let price = Number(service.base_price) || 0;
  if (price > 0) {
    steps.push({ label: "Base price", detail: service.name, amount: round2(price) });
  }

  // 1b. Tier groups (e.g. Quantity): add their flat/unit price.
  for (const { group, value } of chosen.values()) {
    if (group.pricing_role !== "tier") continue;
    let tierAmount = 0;
    if (value.tier_flat_price != null) {
      tierAmount = Number(value.tier_flat_price);
    } else if (value.tier_unit_price != null && value.tier_quantity != null) {
      tierAmount = Number(value.tier_unit_price) * Number(value.tier_quantity);
    }
    price += tierAmount;
    steps.push({
      label: group.label,
      detail: value.label,
      amount: round2(tierAmount),
    });
  }

  // 2. Surcharge groups + surcharge values.
  for (const { group, value } of chosen.values()) {
    if (group.pricing_role !== "surcharge") continue;
    const s = Number(value.surcharge) || 0;
    if (s !== 0) {
      price += s;
      steps.push({ label: group.label, detail: `${value.label} (+${s})`, amount: round2(s) });
    }
  }

  // 3. Multiplier groups.
  for (const { group, value } of chosen.values()) {
    if (group.pricing_role !== "multiplier") continue;
    const m = Number(value.multiplier);
    if (!Number.isFinite(m) || m <= 0 || m === 1) continue;
    const before = price;
    price = price * m;
    steps.push({
      label: group.label,
      detail: `${value.label} (×${m})`,
      amount: round2(price - before),
    });
  }

  // 4. Pricing rules, in priority order.
  const now = Date.now();
  const activeRules = rules
    .filter((r) => r.is_active)
    .filter((r) => !r.starts_at || new Date(r.starts_at).getTime() <= now)
    .filter((r) => !r.ends_at || new Date(r.ends_at).getTime() >= now)
    .filter((r) => matchesSelection(r.match_options ?? {}, selected))
    .sort((a, b) => a.priority - b.priority);

  let minFloor = Number(service.min_price) || 0;

  for (const rule of activeRules) {
    const amt = rule.amount == null ? 0 : Number(rule.amount);
    switch (rule.rule_type) {
      case "combo_override":
      case "campaign_price": {
        const before = price;
        price = amt;
        steps.push({ label: rule.name, detail: "Fixed price", amount: round2(price - before) });
        break;
      }
      case "discount_pct": {
        const delta = -(price * (amt / 100));
        price += delta;
        steps.push({ label: rule.name, detail: `-${amt}%`, amount: round2(delta) });
        break;
      }
      case "discount_flat": {
        price -= amt;
        steps.push({ label: rule.name, detail: `-${amt}`, amount: round2(-amt) });
        break;
      }
      case "surcharge_flat": {
        price += amt;
        steps.push({ label: rule.name, detail: `+${amt}`, amount: round2(amt) });
        break;
      }
      case "min_price": {
        minFloor = Math.max(minFloor, amt);
        break;
      }
    }
  }

  // 5. Clamp to floor + round.
  if (price < minFloor) {
    steps.push({ label: "Minimum price", detail: "Applied floor", amount: round2(minFloor - price) });
    price = minFloor;
  }
  price = round2(Math.max(price, 0));

  // Resolve provider service id for this combination (most specific match wins).
  const providerServiceId = resolveProviderServiceId(providerMappings, selected);

  return {
    currency,
    finalPrice: price,
    basePrice: round2(Number(service.base_price) || 0),
    steps,
    resolvedOptions,
    serviceName: service.name,
    providerServiceId,
  };
}

/** Pick the provider mapping whose match_options is the most specific match. */
export function resolveProviderServiceId(
  mappings: ProviderMapping[],
  selected: Record<string, string>,
): string | null {
  let best: ProviderMapping | null = null;
  let bestSpecificity = -1;
  for (const m of mappings) {
    if (!m.is_active) continue;
    const match = m.match_options ?? {};
    if (!matchesSelection(match, selected)) continue;
    const specificity = Object.keys(match).length;
    if (specificity > bestSpecificity) {
      best = m;
      bestSpecificity = specificity;
    }
  }
  return best?.provider_service_id ?? null;
}
