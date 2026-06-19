# SRD Digital — Digistore Checkout Bridge

A private Shopify custom app that uses **Shopify as the product front-end** and
**Digistore24 as the checkout/payment provider**, with a dynamic option +
pricing engine for SMM and digital products.

Customer flow:

> Shopify product page → choose options → see live price → **Buy Now** →
> Digistore24 checkout → payment → order appears in Shopify.

All secrets (Digistore API key, Shopify Admin token, Supabase service-role key)
live **server-side only**. The storefront sends option *selections*; the server
**recalculates the price from scratch** and creates the Digistore checkout —
the browser can never set or tamper with the price.

---

## Architecture

| Layer | Tech | Role |
|------|------|------|
| Storefront widget | Theme App Extension (vanilla JS) | Renders the service form, shows live price, redirects to Digistore |
| Bridge app | Next.js (App Router) + TypeScript strict | Public API, admin panel, webhook handler |
| Database | Supabase / PostgreSQL | All state (services, options, pricing, sessions, orders, logs) |
| Payments | Digistore24 `createBuyUrl` | Dynamic price per checkout + IPN on payment |
| Orders | Shopify Admin API | Order created after a verified paid IPN |
| Hosting | Vercel | Deploy target |

### Key decision — dynamic pricing works

Digistore24's [`createBuyUrl`](https://dev.digistore24.com/hc/en-us/articles/32553820610705-createBuyUrl)
API accepts a **dynamic price** (`payment_plan[first_amount]` + `currency`) and
custom data (`tracking[custom]`) that loops back in the IPN. So you do **not**
pre-create a Digistore product per option combination — you keep **one Digistore
container product per service template** and the app overrides the price per
request. A static fallback (`buildStaticBuyUrl`) is also included.

---

## Repository layout

```
digistoreapp/
├── src/
│   ├── app/
│   │   ├── admin/                     # Admin panel (light/green SaaS UI)
│   │   │   ├── layout.tsx             # Sidebar + auth guard
│   │   │   ├── login/                 # Supabase email/password login
│   │   │   ├── page.tsx               # Dashboard
│   │   │   ├── products/              # Map Shopify products → services
│   │   │   ├── service-templates/     # Services + options + pricing + test tool
│   │   │   ├── orders/                # Checkout sessions / orders
│   │   │   ├── shopify-sync/          # Pull products from Shopify
│   │   │   ├── settings/              # Credential status + IPN URL
│   │   │   └── logs/                  # Webhook / system logs
│   │   ├── api/
│   │   │   ├── public/                # Storefront-facing (CORS): config, price, checkout
│   │   │   ├── admin/                 # Admin-only (Bearer token): lists, settings, tools
│   │   │   └── webhooks/digistore/    # Digistore IPN handler (SHA512 verified)
│   │   └── checkout/thank-you/        # Post-payment landing page
│   ├── lib/
│   │   ├── pricing/                   # engine.ts (server-side price), loader.ts
│   │   ├── digistore/                 # client.ts (createBuyUrl), ipn.ts (verify)
│   │   ├── shopify/admin.ts           # Create Shopify orders
│   │   ├── supabase/                  # admin (service-role) + browser (anon) clients
│   │   ├── env.ts / public-env.ts     # Validated env access
│   │   ├── admin-auth.ts              # Verify Supabase bearer token for admin API
│   │   ├── validation.ts             # Zod request schemas
│   │   ├── http.ts                    # CORS helpers
│   │   └── log.ts                     # Structured logging to webhook_logs
│   └── components/ui.tsx              # Shared admin UI primitives
├── supabase/migrations/              # 0001_init.sql (schema), 0002_seed_mvp.sql
├── shopify-extension/                # Theme App Extension (storefront widget)
└── docs/                             # SETUP, DEPLOY, TESTING, SHOPIFY, DIGISTORE, TODO
```

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — local install, Supabase, env vars
- **[docs/SHOPIFY.md](docs/SHOPIFY.md)** — custom app, scopes, theme extension
- **[docs/DIGISTORE.md](docs/DIGISTORE.md)** — product, API key, IPN setup
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — Vercel deployment
- **[docs/TESTING.md](docs/TESTING.md)** — end-to-end testing checklist
- **[docs/TODO.md](docs/TODO.md)** — items needing real credentials / API confirmation, and phase-2 roadmap

## Quick start

```bash
npm install
cp .env.example .env.local          # fill in values (see docs/SETUP.md)
# run the SQL in supabase/migrations/ against your Supabase project
npm run dev                          # http://localhost:3000/admin
```
