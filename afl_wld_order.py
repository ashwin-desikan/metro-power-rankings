# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
afl_wld_order.py  — run from the project root (native FS).

AFL displays wins-losses-draws (W-L-D); NRL keeps W-D-L. Makes the D/L column
order and the record strings league-aware in the shared footy components:
hub live ladder, team season-by-season table, the live 2026 row, the all-time
table, and the hero record line. Idempotent + abort-safe.
After running: npx tsc --noEmit
"""
import io, sys

def patch(path, edits):
    s = io.open(path, encoding="utf-8").read()
    for anchor, repl, marker in edits:
        if marker and marker in s:
            print(f"  skip (already applied): {path} :: {marker[:34]}")
            continue
        n = s.count(anchor)
        if n != 1:
            print(f"ABORT: {path}: expected 1 anchor, found {n}: {anchor[:70]!r}")
            sys.exit(1)
        s = s.replace(anchor, repl, 1)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print(f"  patched {path}")

EM = "—"  # em dash used in the source as the "—" placeholder

# ── FootyTeam.tsx ──────────────────────────────────────────────────────────
FT = "app/teams/_footy/FootyTeam.tsx"
patch(FT, [
    # season header: W | D | L  ->  W | (L/D) | (D/L)
    ('                  <th className="text-right py-2 px-2 font-medium">W</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">D</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">L</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">Pts</th>',
     '                  <th className="text-right py-2 px-2 font-medium">W</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "L" : "D"}</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "D" : "L"}</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">Pts</th>',
     '{lg === "afl" ? "L" : "D"}</th>'),
    # season cells: swap d/l values
    ('                      <td className="py-1.5 px-2 text-right">{s.w ?? "' + EM + '"}</td>\n'
     '                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.d ?? "' + EM + '"}</td>\n'
     '                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.l ?? "' + EM + '"}</td>',
     '                      <td className="py-1.5 px-2 text-right">{s.w ?? "' + EM + '"}</td>\n'
     '                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? s.l : s.d) ?? "' + EM + '"}</td>\n'
     '                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? s.d : s.l) ?? "' + EM + '"}</td>',
     '(lg === "afl" ? s.l : s.d)'),
    # live 2026 row cells: swap d/l values
    ('                    <td className="py-1.5 px-2 text-right">{live.w ?? "' + EM + '"}</td>\n'
     '                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{live.d ?? "' + EM + '"}</td>\n'
     '                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{live.l ?? "' + EM + '"}</td>',
     '                    <td className="py-1.5 px-2 text-right">{live.w ?? "' + EM + '"}</td>\n'
     '                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? live.l : live.d) ?? "' + EM + '"}</td>\n'
     '                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? live.d : live.l) ?? "' + EM + '"}</td>',
     '(lg === "afl" ? live.l : live.d)'),
    # hero record string
    ('<span className="text-[var(--text)]">{f.w}-{f.d}-{f.l}</span>',
     '<span className="text-[var(--text)]">{lg === "afl" ? `${f.w}-${f.l}-${f.d}` : `${f.w}-${f.d}-${f.l}`}</span>',
     'afl" ? `${f.w}-${f.l}-${f.d}`'),
    # live hero line record string
    ('<span className="text-[var(--text)] font-semibold">{live.w}-{live.d}-{live.l}</span>',
     '<span className="text-[var(--text)] font-semibold">{lg === "afl" ? `${live.w}-${live.l}-${live.d}` : `${live.w}-${live.d}-${live.l}`}</span>',
     'afl" ? `${live.w}-${live.l}-${live.d}`'),
])

# ── FootyHub.tsx : live ladder ─────────────────────────────────────────────
FH = "app/teams/_footy/FootyHub.tsx"
patch(FH, [
    # live ladder header: W | D | L | For
    ('                  <th className="text-right py-2 px-2 font-medium">W</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">D</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">L</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">For</th>',
     '                  <th className="text-right py-2 px-2 font-medium">W</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "L" : "D"}</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "D" : "L"}</th>\n'
     '                  <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">For</th>',
     '{lg === "afl" ? "L" : "D"}</th>'),
    # live ladder cells: swap d/l values
    ('                      <td className="py-2 px-2 text-right">{r.w}</td>\n'
     '                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.d}</td>\n'
     '                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.l}</td>',
     '                      <td className="py-2 px-2 text-right">{r.w}</td>\n'
     '                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{lg === "afl" ? r.l : r.d}</td>\n'
     '                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{lg === "afl" ? r.d : r.l}</td>',
     '{lg === "afl" ? r.l : r.d}'),
])

# ── FootyAllTimeTable.tsx : record column (client component, has `league`) ──
FA = "app/teams/_footy/FootyAllTimeTable.tsx"
patch(FA, [
    ('{f.w}-{f.d}-{f.l}</td>',
     '{league === "afl" ? `${f.w}-${f.l}-${f.d}` : `${f.w}-${f.d}-${f.l}`}</td>',
     'league === "afl" ? `${f.w}-${f.l}-${f.d}`'),
])

print("\nDone. Verify: npx tsc --noEmit")
