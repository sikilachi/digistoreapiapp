"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Client fetch wrapper that attaches the Supabase access token so admin API
 * routes can authenticate the request. Throws on 401 so callers can redirect.
 */
export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const supabase = supabaseBrowser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    throw new Error("unauthorized");
  }
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? `request_failed_${res.status}`);
  }
  return json;
}
