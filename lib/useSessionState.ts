'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Drop-in replacement for useState that persists the value for the current
 * browser session via sessionStorage. Survives in-app navigation and refresh
 * within the same tab; resets on a new tab or browser restart. SSR-safe.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw != null) setValue(JSON.parse(raw) as T);
      } catch {
        /* private mode / malformed JSON: keep initial */
      }
      hydrated.current = true;
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable or full: ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
