---
name: QA before deployment
description: Always run TypeScript compilation check and verify code correctness before telling user to deploy
type: feedback
---

Never tell the user to commit and push without first verifying the code compiles and passes type checks.

**Why:** Multiple deployments have failed due to TypeScript errors, optional chaining type issues, and other bugs that were only caught by the Vercel build. This wastes the user's time and erodes trust. By the 4th or 5th failed deploy, the user explicitly asked for better QA protocols.

**How to apply:**
1. After any page.tsx or TypeScript file edit, run `npx tsc --noEmit` (or `npx next build` if possible) locally before suggesting the user commit and push.
2. If the sandbox can't run the build (e.g., missing node_modules in mounted dir), at minimum do a manual review of: optional chaining comparisons (`?.length > 0` is a TS error), null/undefined narrowing, type compatibility with the MetroDetail interface in data.ts, and JSX syntax validity.
3. Never use `?.property > 0` pattern in TypeScript strict mode. Always use `obj && obj.property > 0`.
4. When adding new components or functions, verify they match the types defined in lib/data.ts.
5. For extract.py changes, verify the output JSON structure matches what the TypeScript types expect.
