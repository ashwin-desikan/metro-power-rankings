import { redirect } from "next/navigation";

// This page moved to /us-political-leadership. Kept as a redirect because the
// build environment cannot delete the folder; next.config.ts also redirects.
export default function GovernorsMoved() {
  redirect("/us-political-leadership");
}
