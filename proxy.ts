import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (the renamed middleware convention).
 *
 * Responsibilities:
 *  1. Refresh the Supabase auth session on every matched request so server
 *     components always see a live token.
 *  2. Gate the dashboard: unauthenticated visitors are redirected to /login,
 *     signed-in visitors are bounced away from /login.
 *
 * /api/cron and /api/badge are deliberately excluded from the auth gate:
 * cron authenticates itself with the CRON_SECRET bearer token instead of a
 * user session, and the badge is a public, unauthenticated endpoint meant to
 * be embedded in third-party READMEs.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Setup mode: without Supabase credentials the app renders its setup
  // notice instead of redirect-looping into a broken login page.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.startsWith("https://") || !anonKey || url.includes("YOUR-PROJECT-REF")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() revalidates the JWT against Supabase Auth on every request —
  // never trust getSession() alone in server code.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/demo");

  if (!user && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname.startsWith("/login")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, image optimization, favicon,
     * and the cron endpoint (which uses bearer-secret auth, not sessions).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/badge|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
