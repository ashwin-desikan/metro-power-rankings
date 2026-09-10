// The card's type for the /og edge route: Inter 400 and 700 fetched from the
// bundle by URL, the one loader an edge function has (no fs). The Node twin
// for the file-convention image is ./fonts.ts; see the note there.
export async function cardFontsEdge() {
  const [regular, bold] = await Promise.all([
    fetch(new URL("./inter-latin-400-normal.woff", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("./inter-latin-700-normal.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}
