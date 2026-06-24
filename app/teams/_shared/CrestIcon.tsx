import { getCrest } from "@/lib/teamCrest";

// Small inline team crest for tables and cards. Renders nothing when the team
// has no crest, so crest-less rows look exactly as before. Client-safe (the
// crest map is a static import, no fs), so it works in client components too.
export default function CrestIcon({
  name,
  size = 18,
  className = "",
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const crest = name ? getCrest(name) : null;
  if (!crest) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crest.src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block rounded-sm object-contain flex-shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
