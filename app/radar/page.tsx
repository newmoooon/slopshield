import { redirect } from "next/navigation";

import { RepoRadar } from "@/components/repo-radar";
import { SiteHeader } from "@/components/site-header";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "SlopShield AI — Repo Radar",
};

export const dynamic = "force-dynamic";

/**
 * Repo Radar: sweep an entire repository's open PR queue in one audit.
 * Auth-gated like the dashboard; the sweep itself is stateless (nothing is
 * written to the user's scan history).
 */
export default async function RadarPage() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <SiteHeader user={user} />
      <RepoRadar />
    </>
  );
}
