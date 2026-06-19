# Shopify setup

## A. Custom app (Admin API token)

The bridge talks to Shopify via a **custom app** Admin API token — no public
OAuth app needed.

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app** → name it `SRD Digistore Bridge`.
3. **Configuration → Admin API integration → Configure scopes**:

   | Scope | Why |
   |-------|-----|
   | `read_products` | Sync products into the bridge |
   | `write_orders` | Create the Shopify order after payment |
   | `read_orders` | Read/verify orders |
   | `write_draft_orders` | (Optional) draft-order fallback flow |
   | `read_customers` / `write_customers` | (Optional) attach customer to order |

4. **Install app** → reveal the **Admin API access token** (`shpat_…`).
   Put it in `SHOPIFY_ADMIN_API_TOKEN`. It is shown once — store it safely.
5. Set `SHOPIFY_STORE_DOMAIN=your-store.myshopify.com`.

## B. Storefront widget (Theme App Extension)

The `shopify-extension/` folder contains the Theme App Extension that renders
the service form on product pages.

### Deploy the extension
```bash
npm i -g @shopify/cli @shopify/theme
cd shopify-extension
shopify app dev      # local preview, or:
shopify app deploy   # push the extension to your store
```

### Add it to the product page
1. Online Store → **Themes → Customize**.
2. Open a **Product** template.
3. **Add block / Add section** → choose **SRD Digistore Checkout**.
4. In the block settings, set **Bridge App URL** to your deployed app
   (e.g. `https://your-app.vercel.app`, no trailing slash).
5. Keep **Hide native Add to cart** on for products sold via Digistore.
6. Save.

### CORS
Add your storefront origins to `STOREFRONT_ALLOWED_ORIGINS`, e.g.:
```
STOREFRONT_ALLOWED_ORIGINS=https://your-store.myshopify.com,https://yourcustomdomain.com
```
The `/api/public/*` routes only accept those origins.

> No-CLI alternative: you can paste the contents of
> `assets/srd-checkout.js` + `.css` into a theme snippet and the
> `service_form.liquid` markup into your product template, hard-coding the App
> URL. The Theme App Extension is the cleaner, upgrade-safe option.
