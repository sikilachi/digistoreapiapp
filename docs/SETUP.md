# Setup (local development)

## 1. Prerequisites
- Node.js 20+ (tested on 24)
- A Supabase project (free tier is fine)
- A Shopify store + custom app token (see [SHOPIFY.md](SHOPIFY.md))
- A Digistore24 vendor account + API key (see [DIGISTORE.md](DIGISTORE.md))

## 2. Install
```bash
npm install
cp .env.example .env.local
```

## 3. Create the database
In the Supabase dashboard → **SQL Editor**, run, in order:
1. `supabase/migrations/0001_init.sql` (schema + RLS)
2. `supabase/migrations/0002_seed_mvp.sql` (optional MVP seed: Instagram Followers)

> RLS is deny-by-default. The app uses the **service-role key** server-side,
> which bypasses RLS. The anon key (browser) can only do auth, never read data.

## 4. Create the admin user
Supabase dashboard → **Authentication → Users → Add user** (email + password).
This is the account you log into `/admin` with. There is no public sign-up.

## 5. Environment variables

| Variable | Where | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Anon key (auth only) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS — never expose |
| `APP_BASE_URL` | server | Public URL of this app (for IPN/return URLs) |
| `STOREFRONT_ALLOWED_ORIGINS` | server | Comma-separated Shopify origins allowed to call `/api/public/*` |
| `DIGISTORE_API_KEY` | **server only** | Digistore API key |
| `DIGISTORE_IPN_PASSPHRASE` | **server only** | IPN SHA passphrase |
| `DEFAULT_CURRENCY` | server | `EUR` |
| `SHOPIFY_ADMIN_API_TOKEN` | **server only** | `shpat_…` custom app token |
| `SHOPIFY_STORE_DOMAIN` | server | `your-store.myshopify.com` |
| `SHOPIFY_API_VERSION` | server | e.g. `2025-01` |
| `SHOPIFY_WEBHOOK_SECRET` | server | Optional |
| `APP_SESSION_SECRET` | server | Random 32+ char string |

## 6. Run
```bash
npm run dev          # http://localhost:3000  → redirects to /admin
npm run typecheck    # strict TS check
npm run build        # production build
```

## 7. First-run checklist in the admin
1. **Digistore Settings** — confirm all credentials show "Configured" and copy the IPN URL.
2. **Shopify Sync** — click *Sync products* to import your Shopify catalog.
3. **Products** — map a product to a service template + enable checkout.
4. **Service Templates → (open one)** — set the **Digistore product ID**, prices, and toggle **Checkout enabled**. Use the **Test checkout** panel to verify pricing and (optionally) a real `createBuyUrl` call.
