import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

/**
 * CORS handling for storefront-facing /api/public/* routes. Only the configured
 * Shopify storefront origins are allowed.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = serverEnv.storefrontAllowedOrigins();
  const allowAll = allowed.length === 0; // dev convenience if unset
  const ok = origin && (allowAll || allowed.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : allowed[0] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonWithCors(
  data: unknown,
  origin: string | null,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: corsHeaders(origin),
  });
}

export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}
