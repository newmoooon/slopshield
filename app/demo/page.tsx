import Link from "next/link";
import { EyeIcon } from "lucide-react";

import { Dashboard } from "@/components/dashboard";
import { DEMO_SCANS } from "@/lib/demo-data";

export const metadata = {
  title: "SlopShield AI — Live Demo",
};

// Sample timestamps are relative to "now" — recompute per request.
export const dynamic = "force-dynamic";

/**
 * Zero-credential demo: the full dashboard rendered over representative
 * sample telemetry. Interactions stay client-side (audit prompts a sign-in
 * toast, deletes act on the sample rows locally) — no server errors surface
 * in the tour.
 */
export default function DemoPage() {
  return (
    <>
      <div className="border-b border-status-warning/30 bg-status-warning/10">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm text-status-warning sm:px-6">
          <EyeIcon className="size-4 shrink-0" aria-hidden />
          <p>
            Demo mode — sample data only.{" "}
            <Link href="/login" className="font-medium underline underline-offset-2">
              Sign in with GitHub
            </Link>{" "}
            to run live audits.
          </p>
        </div>
      </div>
      <Dashboard initialScans={DEMO_SCANS} demo />
    </>
  );
}
