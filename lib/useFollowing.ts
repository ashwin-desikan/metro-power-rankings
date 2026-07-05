"use client";

import { useCallback, useEffect, useState } from "react";

export type FollowType = "metro" | "team";
export type FollowItem = { type: FollowType; slug: string; name: string; href: string };

const KEY = "con-following-v1";
const EVT = "con-following-change";
const idOf = (type: FollowType, slug: string) => `${type}:${slug}`;

function read(): FollowItem[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr)
      ? arr.filter((x) => x && x.type && x.slug && x.name && x.href)
      : [];
  } catch {
    return [];
  }
}

function write(items: FollowItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable; ignore */
  }
  window.dispatchEvent(new Event(EVT));
}

// Client hook backed by localStorage. No account, nothing leaves the browser.
export function useFollowing() {
  const [items, setItems] = useState<FollowItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(read());
    setReady(true);
    const on = () => setItems(read());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const isFollowing = useCallback(
    (type: FollowType, slug: string) => items.some((i) => i.type === type && i.slug === slug),
    [items],
  );

  const toggle = useCallback((item: FollowItem) => {
    const cur = read();
    const id = idOf(item.type, item.slug);
    const next = cur.some((i) => idOf(i.type, i.slug) === id)
      ? cur.filter((i) => idOf(i.type, i.slug) !== id)
      : [...cur, item];
    write(next);
    setItems(next);
  }, []);

  const remove = useCallback((type: FollowType, slug: string) => {
    const next = read().filter((i) => !(i.type === type && i.slug === slug));
    write(next);
    setItems(next);
  }, []);

  return { items, ready, isFollowing, toggle, remove };
}
