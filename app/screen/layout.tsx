import type { ReactNode } from "react";

// Same clearance fix as /sound: the fixed site header would otherwise overlap
// the section sub-nav (ScreenNav) rendered at the top of each /screen page.
export default function ScreenLayout({ children }: { children: ReactNode }) {
  return <div className="pt-12">{children}</div>;
}
