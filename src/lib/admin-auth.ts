import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Verifies the Supabase access token sent by the admin UI as
 * `Authorization: Bearer <token>`. Returns the user id or null.
 *
 * Admin API routes call this before doing anything. The admin UI obtains the
 * token from the browser Supabase session after email/password login.
 */
export async function getAdminUser(req: NextRequest): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Guard helper: returns a 401 response if not authenticated, else null. */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ user: { id: string; email?: string } } | { response: NextResponse }> {
  const user = await getAdminUser(req);
  if (!user) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { user };
}
