import { LogOutIcon, ShieldCheckIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function SiteHeader({ user }: { user: User }) {
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const displayName =
    (user.user_metadata?.user_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Signed in";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">SlopShield AI</span>
          <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
            PR Forensics
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar host is dynamic
              <img
                src={avatarUrl}
                alt=""
                className="size-6 rounded-full border"
              />
            ) : null}
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">
              {displayName}
            </span>
          </div>
          <Separator orientation="vertical" className="h-5!" />
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOutIcon className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
