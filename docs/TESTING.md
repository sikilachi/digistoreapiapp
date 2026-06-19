# Testing checklist

## Local / pre-launch

### Database & admin
- [ ] Both migrations ran without error; tables exist.
- [ ] Admin user created in Supabase; `/admin/login` works; wrong password is rejected.
- [ ] `/admin` dashboard loads with zero counts on a fresh DB.

### Pricing engine (no external calls)
- [ ] Open a Service Template → **Test checkout** panel.
- [ ] Select `Quantity=1000, Country=Germany` → price = `8.99 × 1.40 = 12.59` (seed values).
- [ ] Change country to `Worldwide (Mixed)` → price = `8.99`.
- [ ] Missing a required option → returns a `MISSING_OPTION` error (no crash).
- [ ] Min-price floor: set a high min price, verify it clamps.

### Storefront API (CORS)
- [ ] `GET /api/public/config/instagram-followers` returns groups + `enabled:true` when the product is mapped & enabled.
- [ ] `POST /api/public/price` with options returns a `finalPrice`.
- [ ] Same request from a disallowed origin is blocked by CORS.
- [ ] `POST /api/public/checkout` with no `targetLink` (when required) returns `missing_link`.

### Digistore (needs real key)
- [ ] **Test checkout** with *"Also call Digistore createBuyUrl"* checked returns `ok:true` + a `url`.
- [ ] Opening the returned URL shows the Digistore order form with the **dynamic price**.
- [ ] `tracking[custom]` shows your `sid:` value (visible after payment in the IPN).

### IPN / webhook (needs real passphrase)
- [ ] Digistore **Test IPN** → admin **Logs** shows the event with `signature: valid`.
- [ ] A *paid* IPN creates a Shopify order (check Shopify Admin → Orders).
- [ ] The Shopify order note/line-item properties contain: service, options, target URL, Digistore order ID, provider service ID.
- [ ] The `checkout_sessions` row flips to `status=paid` with `shopify_order_id` set.
- [ ] A duplicate IPN (same order_id+event) does **not** create a second Shopify order.
- [ ] A tampered IPN (wrong signature) is logged as `invalid` and ignored.

### Full storefront flow (staging)
- [ ] On the product page, native Buy/Add-to-cart is hidden; the service form shows.
- [ ] Selecting options updates the live price within ~250ms.
- [ ] **Buy Now** redirects to Digistore.
- [ ] After a (sandbox/real) payment, the customer lands on `/checkout/thank-you`.
- [ ] The order appears in Shopify and in the admin **Orders** page.
- [ ] On a forced failure, the storefront shows only:
      *"Checkout could not be created. Please contact support."*

## Security checks
- [ ] `grep -r "shpat_\|DIGISTORE_API_KEY\|SERVICE_ROLE" shopify-extension/ src/app/admin` → no secrets in client code.
- [ ] View source on the product page → no API keys, no service-role key.
- [ ] Manually POST a fake low price to `/api/public/checkout` → server ignores it (price recalculated).
- [ ] `/api/admin/*` without a Bearer token → `401`.
