"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Gutscheincode gross anzeigen, mit „Kopieren“. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[26px] font-bold tracking-[0.08em]">{code}</span>
      <Button
        variant={copied ? "outline" : "primary"}
        size="sm"
        onClick={() =>
          navigator.clipboard.writeText(code).then(
            () => {
              setCopied(true);
              toast("Code kopiert.");
              setTimeout(() => setCopied(false), 2400);
            },
            () => toast("Kopieren nicht möglich – bitte den Code abschreiben.", "error"),
          )
        }
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Kopiert" : "Code kopieren"}
      </Button>
    </div>
  );
}
