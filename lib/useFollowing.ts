"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";

export type FollowType = "metro" | "team";
export type FollowItem = { type: FollowType; slug: string; name: string; href: string };
export type FollowUser = { id: string; email: string | null; name: string | null; avatar: string | null };

const KEY = "con-following-v1";
const EVT = "con-following-change";
const idOf = (t: FollowType, s: string) => `${t}:${s}`;

function readLocal(): FollowItem[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((x) => x && x.type && x.slug && x.name && x.href) : [];
  } catch {
    return [];
  }
}
function writeLocal(items: FollowItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable */
  }
  window.dispatchEvent(new Event(EVT));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u: any): FollowUser {
  const m = (u && u.user_metadata) || {};
  return {
    id: u.id,
    email: u.email ?? null,
    name: m.full_name ?? m.name ?? null,
    avatar: m.avatar_url ?? m.picture ?? null,
  };
}

// localStorage when logged out; the Supabase `follows` table when logged in
// (synced across devices). On first sign-in, local follows are merged up.
export function useFollowing() {
  const sb = getSupabase();
  const [items, setItems] = useState<FollowItem[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<FollowUser | null>(null);
  const userRef = useRef<FollowUser | null>(null);
  userRef.current = user;

  const loadFromDb = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb
      .from("follows")
      .select("type,slug,name,href")
      .order("created_at", { ascending: true });
    setItems(((data as FollowItem[]) || []).map((d) => ({ type: d.type, slug: d.slug, name: d.name, href: d.href })));
  }, [sb]);

  const syncUser = useCallback(
    async (u: FollowUser | null) => {
      setUser(u);
      userRef.current = u;
      if (u && sb) {
        const local = readLocal();
        if (local.length) {
          await sb
            .from("follows")
            .upsert(local.map((i) => ({ user_id: u.id, ...i })), {
              onConflict: "user_id,type,slug",
              ignoreDuplicates: true,
            });
        }
        await loadFromDb();
      } else {
        setItems(readLocal());
      }
    },
    [sb, loadFromDb],
  );

  useEffect(() => {
    let mounted = true;
    setItems(readLocal());
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await syncUser(data.session?.user ? mapUser(data.session.user) : null);
      if (mounted) setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      syncUser(session?.user ? mapUser(session.user) : null);
    });
    const onLocal = () => {
      if (!userRef.current) setItems(readLocal());
    };
    window.addEventListener(EVT, onLocal);
    window.addEventListener("storage", onLocal);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener(EVT, onLocal);
      window.removeEventListener("storage", onLocal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  const isFollowing = useCallback(
    (t: FollowType, s: string) => items.some((i) => i.type === t && i.slug === s),
    [items],
  );

  const toggle = useCallback(
    async (item: FollowItem) => {
      const on = items.some((i) => idOf(i.type, i.slug) === idOf(item.type, item.slug));
      const next = on
        ? items.filter((i) => idOf(i.type, i.slug) !== idOf(item.type, item.slug))
        : [...items, item];
      setItems(next); // optimistic
      const u = userRef.current;
      if (u && sb) {
        if (on) await sb.from("follows").delete().eq("type", item.type).eq("slug", item.slug);
        else await sb.from("follows").upsert({ user_id: u.id, ...item }, { onConflict: "user_id,type,slug" });
      } else {
        writeLocal(next);
      }
    },
    [items, sb],
  );

  const remove = useCallback(
    async (t: FollowType, s: string) => {
      const next = items.filter((i) => !(i.type === t && i.slug === s));
      setItems(next);
      const u = userRef.current;
      if (u && sb) await sb.from("follows").delete().eq("type", t).eq("slug", s);
      else writeLocal(next);
    },
    [items, sb],
  );

  const signInWithGoogle = useCallback(() => {
    if (!sb) return;
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
  }, [sb]);

  const signOut = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    setUser(null);
    userRef.current = null;
    setItems(readLocal());
  }, [sb]);

  return { items, ready, isFollowing, toggle, remove, user, signInWithGoogle, signOut, authEnabled: !!sb };
}
