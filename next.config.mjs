/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The storefront widget calls /api/public/* from the Shopify domain.
  // CORS for those routes is handled explicitly in each route handler.
};

export default nextConfig;
