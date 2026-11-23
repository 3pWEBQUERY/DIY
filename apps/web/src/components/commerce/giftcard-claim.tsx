"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { claimGiftCardAction } from "@/app/(app)/geschenkgutscheine/actions";

/** Gutschein per Code dem eigenen Konto hinzufügen */
export function GiftCardClaim({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const claim = useAction(claimGiftCardAction, { onSuccess: () => setCode("") });
  const err = claim.fields.code ? claim.error : claim.error;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) claim.run(code);
      }}
    >
      <label htmlFor="claim-code" className="mb-1.5 block text-[14px] font-semibold">
        Gutschein hinzufügen
      </label>
      <div className="flex max-w-md gap-2">
        <Input
          id="claim-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-[0.06em]"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? "claim-code-err" : undefined}
        />
        <Button type="submit" variant="secondary" disabled={claim.pending || !code.trim()}>
          {claim.pending ? "Prüfe …" : "Hinzufügen"}
        </Button>
      </div>
      {err && (
        <p id="claim-code-err" role="alert" className="mt-1.5 text-[13px] text-danger">
          {err}
        </p>
      )}
    </form>
  );
}
