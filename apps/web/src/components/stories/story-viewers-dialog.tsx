"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Heart, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { storyViewersAction } from "@/app/(app)/stories/actions";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/use-action";

type Data = Extract<Awaited<ReturnType<typeof storyViewersAction>>, { ok: true }>["data"];

/** „Gesehen von“ – nur für die eigene Story. Personen mit Herz stehen oben. */
export function StoryViewersDialog({ open, storyId, onClose }: { open: boolean; storyId: string; onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setData(null);
    setError(null);
    // Netz-/Serverfehler als Fehlerzustand statt unbehandelter Ausnahme
    void callAction(() => storyViewersAction(storyId)).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [open, storyId, attempt]);

  return (
    <Dialog open={open} onClose={onClose} title="Gesehen von" description="Nur du siehst, wer deine Story angeschaut hat.">
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Erneut versuchen
          </Button>
        </div>
      ) : !data ? (
        <div className="grid place-items-center py-10 text-muted">
          <Loader2 className="animate-spin" aria-label="Wird geladen" />
        </div>
      ) : (
        <div>
          <dl className="mb-4 flex gap-6 border-b border-line pb-4">
            <div>
              <dt className="spec">Aufrufe</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-xl font-bold num"><Eye size={17} className="text-muted" aria-hidden />{data.views}</dd>
            </div>
            <div>
              <dt className="spec">Herzen</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-xl font-bold num"><Heart size={17} className="text-moss" aria-hidden />{data.likes}</dd>
            </div>
          </dl>
          {data.viewers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Noch hat niemand deine Story gesehen.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {data.viewers.map((v) => (
                <li key={v.id}>
                  <Link href={`/u/${v.handle}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-sunken">
                    <Avatar src={v.avatarUrl} name={v.displayName} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{v.displayName}</span>
                      <span className="block truncate text-[12px] text-muted">@{v.handle} · {relativeTime(v.viewedAt)}</span>
                    </span>
                    {v.liked && <Heart size={18} className="shrink-0 fill-moss text-moss" aria-label="hat ein Herz gegeben" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
