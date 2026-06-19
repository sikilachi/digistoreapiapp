/**
 * Browser-safe environment values. NEXT_PUBLIC_* vars are inlined at build time
 * by Next.js, so these are safe to import from client components.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
