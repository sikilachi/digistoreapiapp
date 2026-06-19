import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Digistore24 API client.
 *
 * Docs: https://dev.digistore24.com/  (createBuyUrl, API basics)
 * - Base: https://www.digistore24.com/api/call/<function>/<args...>
 *   Digistore's classic API also accepts function + params as query/body.
 * - Auth header: X-DS-API-KEY: <api key>
 * - Response: JSON envelope { api_version, code, message, data }.
 *
 * createBuyUrl lets us override price dynamically and attach custom data that
 * is looped back to us in the IPN, so we do NOT need to pre-create a Digistore
 * product per option combination.
 *
 * NOTE: Digistore's exact parameter encoding for nested arrays (payment_plan[..],
 * tracking[..]) over HTTP should be confirmed against their PHP connector. The
 * encoding below uses bracketed form-keys, which their API accepts. See
 * docs/TODO.md item "Confirm Digistore createBuyUrl payload".
 */

const DS_API_BASE = "https://www.digistore24.com/api/call";

export interface CreateBuyUrlParams {
  productId: string;
  /** Final price computed server-side. */
  amount: number;
  currency: string;
  /** Human-readable name shown on the order form (title placeholder). */
  productName?: string;
  /** Looped back verbatim in the IPN `custom` field. Keep < 255 chars. */
  custom?: string;
  /** Pre-fill buyer email if known. */
  buyerEmail?: string;
  /** Thank-you / success redirect URL. */
  thankYouUrl?: string;
  /** How long the generated buy URL stays valid. Default 24h. */
  validUntil?: string;
}

export interface DigistoreApiResult<T> {
  ok: boolean;
  code: string;
  message?: string;
  data?: T;
}

function buildHeaders(): HeadersInit {
  return {
    "X-DS-API-KEY": serverEnv.digistoreApiKey(),
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/** Flatten nested params into bracketed form keys: payment_plan[first_amount]=.. */
function toFormBody(params: Record<string, unknown>, prefix = ""): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (obj: Record<string, unknown>, pre: string) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const key = pre ? `${pre}[${k}]` : k;
      if (typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
      } else {
        out.append(key, String(v));
      }
    }
  };
  walk(params, prefix);
  return out;
}

async function callApi<T>(fn: string, params: Record<string, unknown>): Promise<DigistoreApiResult<T>> {
  const body = toFormBody(params);
  const res = await fetch(`${DS_API_BASE}/${fn}`, {
    method: "POST",
    headers: buildHeaders(),
    body,
    // Never cache API responses.
    cache: "no-store",
  });

  // Digistore envelope: { result: "success" | "error", message?, data? }.
  let json: { result?: string; message?: string; data?: T } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, code: "invalid_response", message: `HTTP ${res.status}` };
  }

  const ok = res.ok && json.result === "success";
  return {
    ok,
    code: json.result ?? String(res.status),
    message: json.message,
    data: json.data,
  };
}

/**
 * Create a dynamic Digistore24 buy URL with an overridden price.
 * Returns the checkout URL the customer should be redirected to.
 */
export async function createBuyUrl(
  p: CreateBuyUrlParams,
): Promise<DigistoreApiResult<{ url: string }>> {
  const params: Record<string, unknown> = {
    product_id: p.productId,
    payment_plan: {
      first_amount: p.amount.toFixed(2),
      currency: p.currency,
      // Single payment (no installments / subscription) for MVP.
      number_of_installments: 0,
    },
    tracking: {
      custom: p.custom ?? "",
    },
    valid_until: p.validUntil ?? "24h",
  };

  if (p.productName) {
    params.placeholders = { product_name: p.productName };
  }
  if (p.buyerEmail) {
    params.buyer = { email: p.buyerEmail };
  }
  // Digistore rejects non-https return URLs, so only pass it when secure
  // (e.g. skip http://localhost during local development).
  if (p.thankYouUrl && p.thankYouUrl.startsWith("https://")) {
    params.urls = { thankyou_url: p.thankYouUrl };
  }

  const result = await callApi<{ url: string }>("createBuyUrl", params);
  return result;
}

/**
 * Fallback: build a static buy URL for a pre-created Digistore product/payment
 * plan, attaching options as query params that loop back in the IPN. Use this
 * only if createBuyUrl is unavailable for the account. Price is whatever the
 * Digistore product/plan is configured to charge — NOT dynamic.
 */
export function buildStaticBuyUrl(opts: {
  productId: string;
  custom?: string;
  buyerEmail?: string;
}): string {
  const url = new URL(`https://www.digistore24.com/product/${opts.productId}`);
  if (opts.custom) url.searchParams.set("custom", opts.custom);
  if (opts.buyerEmail) url.searchParams.set("email", opts.buyerEmail);
  return url.toString();
}
