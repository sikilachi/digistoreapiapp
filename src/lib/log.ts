import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Level = "info" | "warn" | "error";

/** Persist a structured log row. Never throws (logging must not break flows). */
export async function logEvent(opts: {
  source: "digistore_ipn" | "shopify" | "internal" | "checkout";
  event?: string;
  level?: Level;
  message?: string;
  signatureValid?: boolean | null;
  storeId?: string | null;
  payload?: unknown;
}): Promise<void> {
  try {
    await supabaseAdmin()
      .from("webhook_logs")
      .insert({
        source: opts.source,
        event: opts.event ?? null,
        level: opts.level ?? "info",
        message: opts.message ?? null,
        signature_valid: opts.signatureValid ?? null,
        store_id: opts.storeId ?? null,
        payload: opts.payload ?? null,
      });
  } catch (err) {
    // Last resort: stderr only.
    console.error("[logEvent] failed to write log", err);
  }
}
