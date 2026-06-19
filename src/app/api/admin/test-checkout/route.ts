import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadServiceForPricing, toPricingInputs } from "@/lib/pricing/loader";
import { calculatePrice, PricingError } from "@/lib/pricing/engine";
import { createBuyUrl } from "@/lib/digistore/client";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-checkout
 * Admin tool: run the pricing engine for given options and (optionally) attempt
 * a real Digistore createBuyUrl call. Returns the full breakdown + result so you
 * can verify configuration without going through the storefront.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const body = (await req.json().catch(() => null)) as
    | { serviceId?: string; slug?: string; options?: Record<string, string>; callDigistore?: boolean }
    | null;
  if (!body || (!body.serviceId && !body.slug)) {
    return NextResponse.json({ error: "missing_service" }, { status: 400 });
  }

  const loaded = await loadServiceForPricing({ serviceId: body.serviceId, slug: body.slug });
  if (!loaded) return NextResponse.json({ error: "service_not_found" }, { status: 404 });

  let price;
  try {
    price = calculatePrice(toPricingInputs(loaded, body.options ?? {}));
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "calculation_failed" }, { status: 500 });
  }

  const response: Record<string, unknown> = {
    price: {
      finalPrice: price.finalPrice,
      currency: price.currency,
      steps: price.steps,
      resolvedOptions: price.resolvedOptions,
      providerServiceId: price.providerServiceId,
    },
  };

  if (body.callDigistore) {
    if (!loaded.service.digistore_product_id) {
      response.digistore = { ok: false, error: "service has no digistore_product_id" };
    } else {
      const ds = await createBuyUrl({
        productId: loaded.service.digistore_product_id,
        amount: price.finalPrice,
        currency: price.currency,
        productName: loaded.service.name,
        custom: "sid:test;admin-test",
        thankYouUrl: `${serverEnv.appBaseUrl()}/checkout/thank-you?test=1`,
      });
      response.digistore = ds;
    }
  }

  return NextResponse.json(response);
}
