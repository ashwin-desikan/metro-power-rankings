---
name: Verify actual file paths before editing
description: Always confirm the real file used by the framework (Next.js app router, etc.) before editing; root-level copies are not the deployed files
type: feedback
---

Before editing any file, verify it is the actual file consumed by the build/framework, not a stale copy.

**Why:** Multiple edits were made to a root-level `page.tsx` copy, but the real Next.js route lived at `app/rankings/[slug]/page.tsx`. Every change, TS fix, and deploy instruction was wasted because the wrong file was modified. This happened because the agent assumed the file at the repo root was the one being served.

**How to apply:**
1. For Next.js projects, always check the `app/` directory structure first. The route component for `/rankings/[slug]` lives at `app/rankings/[slug]/page.tsx`, not at the repo root.
2. When a project has both a root-level file and one inside the `app/` directory with the same name, the `app/` version is the real one.
3. Before editing, confirm: "Is this file path actually consumed by the build?" by checking the framework routing conventions.
4. When giving commit instructions, specify the exact file path that needs to be committed, and verify it matches the framework's expected location.
