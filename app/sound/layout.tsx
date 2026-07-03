import type { ReactNode } from "react";

// The site header (SiteNav) is fixed to the top of the viewport. Every /sound
// page renders its section sub-nav (SoundNav) as the first element inside a
// `py-8` main, whose 32px of top padding is shorter than the fixed header, so
// the sub-nav was rendered underneath it and could not be clicked. This
// section layout adds the missing top clearance once for all /sound routes.
export default function SoundLayout({ children }: { children: ReactNode }) {
  return <div className="pt-12">{children}</div>;
}
