import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GitHub OAuth callback. Supabase redirects here with a one-time `code`,
 * which is exchanged server-side for a session cookie. The `next` param is
 * constrained to same-origin relative paths to block open-redirect abuse.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const nextParam = requestUrl.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
    console.error("[auth] code exchange failed:", error);
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_failed", requestUrl.origin)
  );
}
