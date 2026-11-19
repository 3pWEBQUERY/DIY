"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";
import { addBundleToCartAction } from "@/app/(app)/markt/actions";

/** Legt ein ganzes Set in den Warenkorb; danach Link zum Warenkorb. */
export function AddBundleButton({ bundleId, title, signedIn, disabled }: { bundleId: string; title: string; signedIn: boolean; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const add = useAction(addBundleToCartAction, { success: () => `Set „${title}“ liegt im Warenkorb.`, onSuccess: () => setDone(true) });
  if (!signedIn) {
    return (
      <LinkButton href={`/anmelden?weiter=${encodeURIComponent("/warenkorb")}`} variant="outline" size="sm">
        Anmelden und Set kaufen
      </LinkButton>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={() => add.run(bundleId)} disabled={disabled || add.pending}>
        <ShoppingBag size={15} /> {add.pending ? "Lege in den Warenkorb …" : "Set in den Warenkorb"}
      </Button>
      {done && (
        <Link href="/warenkorb" className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
          Zum Warenkorb
        </Link>
      )}
    </span>
  );
}
