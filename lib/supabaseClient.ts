import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// The Supabase URL and anon (publishable) key are PUBLIC by design: they ship in
// every browser bundle and Row Level Security is what actually protects the data.
// We hardcode known-good values so a missing or malformed build-time env var can
// never silently break auth again.
//
// Root cause of the long-standing /me sign-in failure (fixed here): in production
// NEXT_PUBLIC_SUPABASE_ANON_KEY was inlined as a PLACEHOLDER string
// ('<the "anon public" key from ... -> Project ... -> API>') containing non-Latin-1
// arrow characters. supabase-js puts the key into the apikey/Authorization request
// headers, and the browser's fetch() throws "String contains non ISO-8859-1 code
// point" while building the request. Redirect-based sign-in (no fetch) appeared to
// work, but token refresh and every follows read/write threw instantly, so sessions
// never survived the first hour and no follow ever reached the database.
const SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

// A real key is printable ASCII (a base64url JWT, or an sb_publishable_ string). Any
// non-ASCII code point means a placeholder or typo slipped into the env var; reject
// it and fall back to the constant rather than construct a client that throws on
// every request header.
function asciiKey(k: string | undefined): k is string {
  return !!k && /^[\x21-\x7e]+$/.test(k) && (k.startsWith("eyJ") || k.startsWith("sb_"));
}
function supabaseUrl(u: string | undefined): u is string {
  return !!u && /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(u);
}

// Browser Supabase client (anon key). Persists the session and auto-refreshes so
// Following syncs across devices; falls back to the hardcoded public values when the
// env vars are absent or malformed.
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = supabaseUrl(envUrl) ? envUrl : SUPABASE_URL;
  const key = asciiKey(envKey) ? envKey : SUPABASE_ANON_KEY;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
