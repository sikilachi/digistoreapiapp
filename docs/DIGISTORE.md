# Digistore24 setup

## 1. Get your API key
Digistore24 dashboard → **Account → Settings → API & integrations** (wording
varies). Create/reveal an **API key**. Put it in `DIGISTORE_API_KEY`.

The app authenticates API calls with the header `X-DS-API-KEY: <key>`.

## 2. Create one container product per service
For each service template (e.g. "Instagram Followers") create **one** Digistore
product:
1. **Products → Create product**.
2. Give it a name + a default price (the app overrides the price per checkout,
   but Digistore requires a base product/payment plan to exist).
3. Set it to **single payment** for the MVP.
4. Approve / activate the product so it can be sold.
5. Copy the **product ID** and paste it into the service template's
   **Digistore product ID** field in the admin panel.

> Why one product per service (your chosen model): cleaner Digistore-side
> reporting and payouts, and the order form shows a sensible product name.

## 3. Dynamic pricing — `createBuyUrl`
When a customer clicks **Buy Now**, the bridge calls `createBuyUrl` with:
- `product_id` = the container product
- `payment_plan[first_amount]` = the server-calculated price
- `payment_plan[currency]` = `EUR`
- `tracking[custom]` = `sid:<checkout_session_id>;<option summary>`
- `urls[thankyou_url]` = the app's thank-you page

Digistore returns a ready checkout URL (valid 24h) that the browser is
redirected to. See `src/lib/digistore/client.ts`.

## 4. Configure the IPN (webhook)
1. Digistore dashboard → **Settings → IPN** (Instant Payment Notification) or on
   the product's **Connections**.
2. Set the IPN URL to:
   ```
   https://YOUR-APP.vercel.app/api/webhooks/digistore
   ```
   (Copy it from the admin **Digistore Settings** page.)
3. Set an **IPN passphrase** and put the same value in
   `DIGISTORE_IPN_PASSPHRASE`. This is used to verify the `sha_sign` signature.
4. Add custom field pass-through so `custom` is included (it is by default).
5. Use Digistore's **"Test IPN"** button to send a signed test — it should
   appear in the admin **Logs** page with `signature: valid`.

## 5. Signature verification
`src/lib/digistore/ipn.ts` implements the documented SHA-512 algorithm
(sort keys case-insensitively, concatenate `KEY=VALUE{passphrase}` for each
non-empty field, SHA-512, compare uppercase hex).

⚠️ **Confirm against a real test IPN** before going live — see
[TODO.md](TODO.md). If a real test shows `invalid`, compare the exact string
construction against Digistore's official `sha_sign.php` and adjust
(e.g. key casing or empty-value handling).
