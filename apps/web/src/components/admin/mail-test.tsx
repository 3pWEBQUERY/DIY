"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendTestMailAction } from "@/app/admin/system/actions";

export function MailTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTestMailAction();
            const res = r.ok ? { ok: true, text: `Gesendet an ${r.data.to}. Schau in dein Postfach (auch im Spam-Ordner).` } : { ok: false, text: r.error };
            setResult(res);
            toast(res.text, res.ok ? "ok" : "error");
          })
        }
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Test-E-Mail an mich senden
      </Button>
      {result && <p className={`mt-2 text-[13px] ${result.ok ? "text-moss" : "text-danger"}`}>{result.text}</p>}
    </div>
  );
}
