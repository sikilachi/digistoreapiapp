import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings — reports which credentials are configured (booleans
 * only; never returns the secret values). Secrets live in env vars.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const present = (name: string) => Boolean(process.env[name]?.trim());

  return NextResponse.json({
    digistore: {
      apiKey: present("DIGISTORE_API_KEY"),
      ipnPassphrase: present("DIGISTORE_IPN_PASSPHRASE"),
      ipnUrl: `${process.env.APP_BASE_URL ?? ""}/api/webhooks/digistore`,
      currency: process.env.DEFAULT_CURRENCY ?? "EUR",
    },
    shopify: {
      adminToken: present("SHOPIFY_ADMIN_API_TOKEN"),
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN ?? "",
      apiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-01",
    },
    supabase: {
      url: present("NEXT_PUBLIC_SUPABASE_URL"),
      serviceRole: present("SUPABASE_SERVICE_ROLE_KEY"),
    },
    app: {
      baseUrl: process.env.APP_BASE_URL ?? "",
      allowedOrigins: process.env.STOREFRONT_ALLOWED_ORIGINS ?? "",
    },
  });
}
