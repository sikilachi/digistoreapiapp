"use client";
/**
 * Browser Supabase client using the ANON key. Used ONLY for admin auth
 * (login/session). It has no access to business tables (RLS deny-by-default).
 */
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/public-env";

export function supabaseBrowser() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
