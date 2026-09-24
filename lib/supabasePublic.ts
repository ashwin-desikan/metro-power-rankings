// Server-safe public Supabase settings for API routes.
//
// Why this exists (2026-09-24): in production NEXT_PUBLIC_SUPABASE_ANON_KEY
// holds a placeholder string with non-Latin-1 characters (see the note in
// lib/supabaseClient.ts). Node's fetch() throws while building a request
// header from it, so every route that trusted the env var failed to verify
// a signed-in user and answered 401: /fans kept showing the sign-in card to
// people who were signed in. Validate the env values and fall back to the
// known-good public constants, exactly like the browser client does.
const FALLBACK_URL = "https://nmprqkmymrdknffwnuur.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

function validKey(k: string | undefined): k is string {
  return !!k && /^[\x21-\x7e]+$/.test(k) && (k.startsWith("eyJ") || k.startsWith("sb_"));
}
function validUrl(u: string | undefined): u is string {
  return !!u && /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(u);
}

const envUrl = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find(validUrl);
export const SB_PUBLIC_URL = (envUrl ?? FALLBACK_URL).replace(/\/$/, "");
export const SB_PUBLIC_ANON_KEY = validKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : FALLBACK_ANON_KEY;
