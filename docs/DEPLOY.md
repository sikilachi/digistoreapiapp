# Deploy to Vercel

## 1. Install the CLI (recommended)
```bash
npm i -g vercel
```

## 2. Push the repo
Create a git repo and push to GitHub/GitLab, or deploy directly:
```bash
vercel            # first run links/creates the project
vercel --prod     # production deploy
```

## 3. Environment variables
Set every variable from `.env.example` in Vercel:
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# …repeat for each, or use the Vercel dashboard → Project → Settings → Environment Variables
```
Set them for **Production** (and **Preview** if you test there). Mark the
non-`NEXT_PUBLIC_*` ones as plain env vars (they stay server-side).

> Set `APP_BASE_URL` to your production URL (e.g. `https://your-app.vercel.app`)
> so the IPN/return URLs are correct. Update the Digistore IPN URL to match.

## 4. Runtime notes
- All API routes use the Node.js runtime (`export const runtime = "nodejs"`) —
  required for the `crypto` SHA-512 IPN verification and the Supabase
  service-role client.
- Routes are `force-dynamic`; nothing sensitive is statically cached.
- Default function timeout on Vercel is generous (300s); these handlers are
  fast.

## 5. Post-deploy
1. Open `https://your-app.vercel.app/admin`, log in.
2. **Digistore Settings** → copy the IPN URL → paste into Digistore.
3. **Shopify Sync** → import products.
4. Set the **Bridge App URL** in the Shopify theme block to the production URL.
5. Run the [testing checklist](TESTING.md).

## 6. Custom domain (optional)
Add a domain in Vercel → update `APP_BASE_URL`, `STOREFRONT_ALLOWED_ORIGINS`,
the Shopify block App URL, and the Digistore IPN URL accordingly.
