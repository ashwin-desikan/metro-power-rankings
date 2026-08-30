import type { ReactNode } from "react";

// Pass-through. This layout used to add `pt-12` to clear a FIXED site
// header; SiteNav has been `sticky top-0` since then, so it occupies its own
// layout space and no page needs clearance padding (DESIGN-STANDARDS.md,
// "The nav owns its own space"). The leftover padding was dead space at the
// top of every /sound route on phones, where vertical room is the scarce
// resource.
export default function SoundLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
