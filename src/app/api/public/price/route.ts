import { NextRequest } from "next/server";
import { jsonWithCors, preflight } from "@/lib/http";
import { priceRequestSchema } from "@/lib/validation";
import { loadServiceForPricing, toPricingInputs } from "@/lib/pricing/loader";
import { calculatePrice, PricingError } from "@/lib/pricing/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * POST /api/public/price
 * Returns a server-calculated price for the selected options (live preview).
 * Always recalculated server-side; the browser cannot influence the amount.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "invalid_json" }, origin, { status: 400 });
  }

  const parsed = priceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors({ error: "invalid_request" }, origin, { status: 400 });
  }
  const { serviceId, slug, options } = parsed.data;
  if (!serviceId && !slug) {
    return jsonWithCors({ error: "missing_service" }, origin, { status: 400 });
  }

  const loaded = await loadServiceForPricing({ serviceId, slug });
  if (!loaded) {
    return jsonWithCors({ error: "service_not_found" }, origin, { status: 404 });
  }

  try {
    const result = calculatePrice(toPricingInputs(loaded, options));
    return jsonWithCors(
      {
        currency: result.currency,
        finalPrice: result.finalPrice,
        // Expose a breakdown but not the underlying rule internals.
        breakdown: result.steps.map((s) => ({ label: s.label, detail: s.detail, amount: s.amount })),
      },
      origin,
    );
  } catch (err) {
    if (err instanceof PricingError) {
      return jsonWithCors({ error: err.code, message: err.message }, origin, { status: 422 });
    }
    return jsonWithCors({ error: "calculation_failed" }, origin, { status: 500 });
  }
}
