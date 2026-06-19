import "server-only";
import crypto from "node:crypto";

/**
 * Digistore24 IPN signature verification.
 *
 * Digistore signs each IPN POST with `sha_sign` (SHA-512, uppercase hex) using
 * the IPN passphrase configured on the connection.
 *
 * Official algorithm (per Digistore's sha_sign.php example):
 *   1. Remove `sha_sign` from the parameters.
 *   2. Sort remaining keys case-insensitively (ascending).
 *   3. For each key with a non-empty value, append: `KEY=VALUE` + passphrase.
 *   4. SHA-512 the concatenated string; compare uppercase hex to `sha_sign`.
 *
 * Keys are compared/emitted in UPPERCASE in Digistore's reference script.
 *
 * IMPORTANT: This mirrors the documented algorithm. Before trusting it in
 * production, verify against an actual signed test IPN (admin → "Test IPN").
 * See docs/TODO.md "Confirm Digistore IPN signature".
 */
export function verifyIpnSignature(
  params: Record<string, string>,
  passphrase: string,
): boolean {
  const provided = params["sha_sign"];
  if (!provided) return false;

  const entries = Object.entries(params).filter(([k]) => k.toLowerCase() !== "sha_sign");

  // Sort by uppercased key.
  entries.sort((a, b) => (a[0].toUpperCase() < b[0].toUpperCase() ? -1 : 1));

  let shaString = "";
  for (const [key, value] of entries) {
    if (value === "" || value === undefined || value === null) continue;
    shaString += `${key.toUpperCase()}=${value}${passphrase}`;
  }

  const computed = crypto.createHash("sha512").update(shaString, "utf8").digest("hex").toUpperCase();

  // Constant-time compare.
  const a = Buffer.from(computed);
  const b = Buffer.from(provided.toUpperCase());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Normalised view of the fields we care about from a Digistore IPN. */
export interface ParsedIpn {
  event: string;
  orderId: string;
  billingStatus: string;
  isPaid: boolean;
  amount: number | null;
  currency: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  productName: string | null;
  custom: string | null;
  raw: Record<string, string>;
}

export function parseIpn(params: Record<string, string>): ParsedIpn {
  const num = (v: string | undefined) => {
    if (!v) return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const billingStatus = params["billing_status"] ?? "";
  return {
    event: params["event"] ?? "",
    orderId: params["order_id"] ?? "",
    billingStatus,
    isPaid:
      (params["order_is_paid"] ?? "").toUpperCase() === "Y" ||
      billingStatus.toLowerCase() === "paid" ||
      (params["event"] ?? "") === "on_payment",
    amount: num(params["amount_brutto"]) ?? num(params["amount"]),
    currency: params["currency"] ?? null,
    email: params["email"] ?? params["address_email"] ?? null,
    firstName: params["address_first_name"] ?? params["first_name"] ?? null,
    lastName: params["address_last_name"] ?? params["last_name"] ?? null,
    productName: params["product_name"] ?? null,
    custom: params["custom"] ?? null,
    raw: params,
  };
}
