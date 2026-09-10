import { readFileSync } from "fs";
import { join } from "path";

// The card's type for the file-convention image (app/opengraph-image.tsx),
// which renders on the Node runtime at build time: read from disk. The edge
// route cannot read a file and fetches the same two WOFFs from its bundle
// instead (./fonts-edge.ts). Both give Satori Inter 400 and 700 (latin
// subset, 31 KB each, from @fontsource/inter under the OFL; FONT-LICENSE.txt),
// because Satori's own sans has no bold and the title rendered regular until
// 2026-09-10. `fetch(new URL(..., import.meta.url))` from a Node route fails
// at build ("Failed to parse URL from /_next/static/media/...woff"); that is
// why there are two loaders.
export function cardFontsNode() {
  const dir = join(process.cwd(), "app", "og");
  return [
    { name: "Inter", data: readFileSync(join(dir, "inter-latin-400-normal.woff")), weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: readFileSync(join(dir, "inter-latin-700-normal.woff")), weight: 700 as const, style: "normal" as const },
  ];
}
