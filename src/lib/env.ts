/**
 * Centralised, validated environment access.
 *
 * Server-only secrets are read lazily and never bundled to the client. The
 * NEXT_PUBLIC_* values are the only ones safe to reference in browser code.
 */
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  appBaseUrl: () => optional("APP_BASE_URL", "http://localhost:3000"),
  storefrontAllowedOrigins: () =>
    optional("STOREFRONT_ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),

  digistoreApiKey: () => required("DIGISTORE_API_KEY"),
  digistoreIpnPassphrase: () => required("DIGISTORE_IPN_PASSPHRASE"),
  defaultCurrency: () => optional("DEFAULT_CURRENCY", "EUR"),
  // Single Digistore "container" product used for ALL dynamic-price checkouts.
  // The real price + product name are sent dynamically per request.
  digistoreDefaultProductId: () => required("DIGISTORE_DEFAULT_PRODUCT_ID"),

  shopifyAdminToken: () => required("SHOPIFY_ADMIN_API_TOKEN"),
  shopifyStoreDomain: () => required("SHOPIFY_STORE_DOMAIN"),
  shopifyApiVersion: () => optional("SHOPIFY_API_VERSION", "2025-01"),

  appSessionSecret: () => required("APP_SESSION_SECRET"),
} as const;
