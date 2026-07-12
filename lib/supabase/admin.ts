import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for trusted server jobs (the cron aggregator). Bypasses
 * RLS by design — it must never be imported from anything client-reachable,
 * which the "server-only" guard enforces at build time.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service-role credentials are not configured");
  }
  // A leftover placeholder is worse than a missing key: every admin query
  // fails as a returned error value, which callers can silently swallow —
  // badge caching and the cron rollup then degrade invisibly.
  if (/your-service|YOUR-|example/i.test(serviceRoleKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY still holds a placeholder — copy the real secret key from Supabase → Project Settings → API keys"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
