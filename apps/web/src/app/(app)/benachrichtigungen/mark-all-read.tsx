"use client";

import { CheckCheck } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";

export function MarkAllRead() {
  const { run, pending } = useAction(markAllReadAction);
  return (
    <Button variant="outline" onClick={() => run()} disabled={pending} aria-busy={pending}>
      <CheckCheck size={16} aria-hidden /> Alle gelesen
    </Button>
  );
}
