"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/** The page origin, hydration-safe: null on the server pass, resolved on the
 *  client — reading window.location during render would make the two paints
 *  differ (hydration mismatch). */
function usePageOrigin(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null
  );
}

/** Copy-to-clipboard markdown for embedding this PR's live badge in a README. */
export function BadgeSnippet({
  repoFullName,
  prNumber,
}: {
  repoFullName: string;
  prNumber: number;
}) {
  const [copied, setCopied] = useState(false);
  const origin = usePageOrigin();
  if (!origin) return null;

  const badgeUrl = `${origin}/api/badge/${repoFullName}/${prNumber}`;
  // The badge clicks through to the PR's public report page, so a README
  // embed is a working entry point into the product, not just a picture.
  const markdown = `[![SlopShield](${badgeUrl})](${origin}/report/${repoFullName}/${prNumber})`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Badge markdown copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- external, dynamically-generated SVG */}
      <img src={badgeUrl} alt={`SlopShield risk badge for ${repoFullName}#${prNumber}`} />
      <Button type="button" variant="outline" size="xs" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        Copy README badge
      </Button>
    </div>
  );
}
