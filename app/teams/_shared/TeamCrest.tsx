import type { ReactNode } from "react";
import { getCrest } from "@/lib/teamCrest";

// Renders a self-hosted club crest when one exists in team-metadata.json,
// otherwise renders the caller-supplied fallback (monogram on club pages,
// sport icon on cross-sport cards). Safe in both server and client components.
export default function TeamCrest({
  name,
  size = 40,
  fallback,
}: {
  name: string | null | undefined;
  size?: number;
  fallback: ReactNode;
}) {
  const crest = name ? getCrest(name) : null;
  if (!crest) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crest.src}
      alt={crest.alt}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-full flex-shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
