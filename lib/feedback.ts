import "server-only";

// Server-side reads of public.feedback for the gated /admin/feedback view.
// The table has no insert/update policy for any browser role, so both the
// relay (/api/feedback) and this reader use the service key. Anything that
// touches this module is behind the /admin gate in proxy.ts.

export type FeedbackKind = "correction" | "coverage" | "idea" | "bug";
export type FeedbackStatus = "new" | "triaged" | "fixed" | "declined";

export type FeedbackRow = {
  id: number;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  kind: FeedbackKind;
  path: string;
  body: string;
  status: FeedbackStatus;
  admin_note: string | null;
};

export const SB_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nmprqkmymrdknffwnuur.supabase.co";

export const STATUSES: FeedbackStatus[] = ["new", "triaged", "fixed", "declined"];

/** Newest first. Returns [] rather than throwing so a missing service key
 *  renders an empty panel with an explanation instead of a 500. */
export async function loadFeedback(limit = 200): Promise<FeedbackRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/feedback?select=*&order=created_at.desc&limit=${limit}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as FeedbackRow[];
  } catch {
    return [];
  }
}
