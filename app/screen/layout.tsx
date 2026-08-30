import type { ReactNode } from "react";

// Pass-through — see the note in app/sound/layout.tsx. SiteNav is
// `sticky top-0`, so the old `pt-12` fixed-header clearance is dead space.
export default function ScreenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
