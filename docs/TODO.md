# TODO — confirmations & roadmap

## 🔴 Needs your real credentials / external confirmation (before launch)

1. **Confirm Digistore `createBuyUrl` payload encoding.**
   `src/lib/digistore/client.ts` sends `payment_plan[first_amount]`,
   `payment_plan[currency]`, `tracking[custom]`, `placeholders[product_name]`,
   `urls[thankyou_url]` as bracketed form fields to
   `https://www.digistore24.com/api/call/createBuyUrl` with header `X-DS-API-KEY`.
   → Run a real call (admin **Test checkout** → "call Digistore"). If the
   response `code` isn't `success`, check the message and compare with the
   official PHP connector (`examples/buyurl.php`). Adjust field names if needed.
   The response field holding the URL is read as `data.url` — confirm the exact
   key in the live JSON and update if different.

2. **Confirm Digistore IPN signature algorithm.**
   `src/lib/digistore/ipn.ts` implements the documented SHA-512 scheme
   (uppercased keys, `KEY=VALUE{passphrase}` concatenation, skip empty values).
   → Send a Digistore **Test IPN** and confirm the admin Logs show
   `signature: valid`. If invalid, diff against Digistore's `sha_sign.php`
   (key casing / empty-value handling are the usual differences).

3. **Confirm IPN field names** for paid status. We read `order_is_paid`,
   `billing_status`, `event=on_payment`, `amount_brutto`, `email`,
   `address_first_name/last_name`, `product_name`, `custom`. Verify against an
   actual IPN payload (logged in `webhook_logs.payload`) and adjust `parseIpn`.

4. **Digistore product IDs.** Create one container product per service and enter
   its ID in each Service Template (admin).

5. **Shopify Admin token + scopes** — see [SHOPIFY.md](SHOPIFY.md).

6. **Set `APP_BASE_URL`** in production so the IPN/return URLs are correct.

## 🟡 Phase 2 (structure already in the DB)

- **Admin CRUD editors** for option groups, option values, pricing rules, and
  provider mappings (currently seeded via SQL; viewable + service settings
  editable in the UI). Add create/edit/delete forms.
- **Auto-dispatch paid orders to the SMM provider API**
  (`provider_mappings` + `provider_service_id` already resolved per checkout):
  add an outbound provider client, store `provider_order_id`, status polling,
  refill logic, manual resend / cancel, and error logs.
- **More option group types** already supported by the engine: gender, refill,
  quality, comment type (random/custom), story views, etc. Just add groups/values.
- **Bulk import/export** of services, options, pricing (CSV/JSON).
- **Campaign scheduling UI** for `pricing_rules.starts_at/ends_at`.
- **Multi-currency** (per-rule currency already in schema).
- **Encrypted credential storage** in `app_settings` if you prefer DB over env
  (use Supabase Vault / pgcrypto) — currently secrets are env vars (simplest & safe).
- **Shopify order → fulfillment** updates when the provider completes delivery.
- **Rate limiting / bot protection** on `/api/public/*` (e.g. Vercel BotID/WAF).

## 🟢 Nice-to-have
- Unit tests for `pricing/engine.ts` (pure function — easy to test).
- Retry queue for failed Shopify order creation (currently logged for manual retry).
- Email alerts on `error`-level logs.
