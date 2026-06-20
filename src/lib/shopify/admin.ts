import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Minimal Shopify Admin REST client for creating orders after a Digistore
 * payment is confirmed. Uses a custom-app Admin API access token.
 *
 * We create the order as already-paid (financial_status: "paid") with the
 * service details captured in note, tags, line item properties, and metafields.
 */

function adminBase(): string {
  const domain = serverEnv.shopifyStoreDomain();
  const version = serverEnv.shopifyApiVersion();
  return `https://${domain}/admin/api/${version}`;
}

function headers(): HeadersInit {
  return {
    "X-Shopify-Access-Token": serverEnv.shopifyAdminToken(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface ShopifyVariantInfo {
  variantId: string;
  productId: string;
  price: number; // major units, shop currency
  variantTitle: string;
  productTitle: string;
  productHandle: string;
  available: boolean;
}

/**
 * Fetch a variant's authoritative price + titles from Shopify (server-side).
 * The browser-submitted price is never trusted; this is the source of truth.
 */
export async function getVariantInfo(variantId: string): Promise<ShopifyVariantInfo | null> {
  try {
    const vRes = await fetch(`${adminBase()}/variants/${encodeURIComponent(variantId)}.json`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!vRes.ok) return null;
    const vJson = (await vRes.json()) as {
      variant?: {
        id: number;
        product_id: number;
        price: string;
        title: string;
        inventory_quantity?: number;
        inventory_management?: string | null;
      };
    };
    const v = vJson.variant;
    if (!v) return null;

    // Product (for title + handle shown on the Digistore order form).
    let productTitle = "";
    let productHandle = "";
    try {
      const pRes = await fetch(
        `${adminBase()}/products/${v.product_id}.json?fields=title,handle`,
        { headers: headers(), cache: "no-store" },
      );
      if (pRes.ok) {
        const pJson = (await pRes.json()) as { product?: { title: string; handle: string } };
        productTitle = pJson.product?.title ?? "";
        productHandle = pJson.product?.handle ?? "";
      }
    } catch {
      /* non-fatal: title is display-only */
    }

    const price = Number(v.price);
    return {
      variantId: String(v.id),
      productId: String(v.product_id),
      price: Number.isFinite(price) ? price : 0,
      variantTitle: v.title ?? "",
      productTitle,
      productHandle,
      available: true,
    };
  } catch {
    return null;
  }
}

export interface CreateOrderInput {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  serviceName: string;
  price: number;
  currency: string;
  quantity?: number;
  /** Display rows for the order note + line item properties. */
  optionLines: Array<{ label: string; value: string }>;
  targetLink: string | null;
  orderNotes: string | null;
  digistoreOrderId: string;
  providerServiceId: string | null;
  shopifyProductId?: string | null;
}

export interface ShopifyOrderResult {
  ok: boolean;
  orderId?: string;
  orderName?: string;
  error?: string;
  status: number;
}

export async function createShopifyOrder(input: CreateOrderInput): Promise<ShopifyOrderResult> {
  const properties = [
    ...input.optionLines.map((o) => ({ name: o.label, value: o.value })),
    ...(input.targetLink ? [{ name: "Target link", value: input.targetLink }] : []),
    ...(input.orderNotes ? [{ name: "Order notes", value: input.orderNotes }] : []),
    { name: "Digistore Order ID", value: input.digistoreOrderId },
    ...(input.providerServiceId
      ? [{ name: "Provider Service ID", value: input.providerServiceId }]
      : []),
  ];

  const noteLines = [
    `Service: ${input.serviceName}`,
    ...input.optionLines.map((o) => `${o.label}: ${o.value}`),
    ...(input.targetLink ? [`Target URL: ${input.targetLink}`] : []),
    ...(input.orderNotes ? [`Notes: ${input.orderNotes}`] : []),
    `Digistore Order ID: ${input.digistoreOrderId}`,
    ...(input.providerServiceId ? [`Provider Service ID: ${input.providerServiceId}`] : []),
  ];

  const body = {
    order: {
      email: input.email ?? undefined,
      financial_status: "paid",
      currency: input.currency,
      send_receipt: false,
      send_fulfillment_receipt: false,
      tags: ["digistore", "smm", input.serviceName].join(", "),
      note: noteLines.join("\n"),
      note_attributes: properties,
      customer: input.email
        ? {
            email: input.email,
            first_name: input.firstName ?? undefined,
            last_name: input.lastName ?? undefined,
          }
        : undefined,
      line_items: [
        {
          title: input.serviceName,
          price: input.price.toFixed(2),
          quantity: input.quantity ?? 1,
          requires_shipping: false,
          taxable: false,
          properties,
        },
      ],
      metafields: [
        {
          namespace: "srd_digistore",
          key: "digistore_order_id",
          type: "single_line_text_field",
          value: input.digistoreOrderId,
        },
        {
          namespace: "srd_digistore",
          key: "provider_service_id",
          type: "single_line_text_field",
          value: input.providerServiceId ?? "",
        },
        {
          namespace: "srd_digistore",
          key: "target_link",
          type: "single_line_text_field",
          value: input.targetLink ?? "",
        },
      ],
    },
  };

  try {
    const res = await fetch(`${adminBase()}/orders.json`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      order?: { id: number; name: string };
      errors?: unknown;
    };
    if (!res.ok || !json.order) {
      return {
        ok: false,
        status: res.status,
        error: JSON.stringify(json.errors ?? json) || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      orderId: String(json.order.id),
      orderName: json.order.name,
    };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "network error" };
  }
}
