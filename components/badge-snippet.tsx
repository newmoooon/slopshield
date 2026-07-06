"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copy-to-clipboard markdown for embedding this PR's live badge in a README. */
export function BadgeSnippet({
  repoFullName,
  prNumber,
}: {
  repoFullName: string;
  prNumber: number;
}) {
  const [copied, setCopied] = useState(false);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-deployment.example";
  const badgeUrl = `${origin}/api/badge/${repoFullName}/${prNumber}`;
  const markdown = `[![SlopShield](${badgeUrl})](${origin})`;

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
