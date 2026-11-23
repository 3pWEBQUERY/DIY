"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { COMMENT_FILTER_MAX, matchCommentFilter, normalizeFilterText } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { RelativeTime } from "@/components/ui/relative-time";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { useRouter } from "next/navigation";
import { applyCommentFilterAction, saveCommentFilterAction } from "@/app/studio/kommentare/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteCommentAction, unfilterCommentAction } from "@/app/(app)/social-actions";
import { proHref } from "@/lib/pro-features";

/** Wörter aus dem Textfeld: je Zeile oder durch Komma/Semikolon getrennt, bereinigt und ohne Doppelte */
function parseWords(text: string) {
  const seen = new Set<string>();
  return text
    .split(/[\n,;]+/)
    .map((w) => normalizeFilterText(w).slice(0, 40).trim())
    .filter((w) => w.length >= 2 && !seen.has(w) && (seen.add(w), true));
}

export function CommentFilterForm({ initial, pro }: { initial: string[]; pro: boolean }) {
  const [text, setText] = useState(initial.join("\n"));
  const [probe, setProbe] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const words = useMemo(() => parseWords(text), [text]);
  const hit = probe.trim() ? matchCommentFilter(probe, words) : null;
  const tooMany = words.length > COMMENT_FILTER_MAX;
  const changed = words.join("\n") !== initial.join("\n");

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await callAction(() => saveCommentFilterAction(words));
          if (!r.ok) {
            setError(r.error);
            return void toast(r.error, "error");
          }
          toast(r.message ?? "Gespeichert.");
          setText(r.data.words.join("\n"));
        });
      }}
    >
      <Field label="Gefilterte Wörter" hint={`Ein Wort oder eine Wortfolge pro Zeile · ${words.length} von ${COMMENT_FILTER_MAX}`} error={error ?? (tooMany ? `Höchstens ${COMMENT_FILTER_MAX} Wörter` : undefined)}>
        {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"z. B.\ngratis versand\nmist"} disabled={!pro} />}
      </Field>
      <Field label="Ausprobieren" optional hint="Schreib einen Beispiel-Kommentar und sieh, ob er ausgeblendet würde.">
        {(p) => <input {...p} value={probe} onChange={(e) => setProbe(e.target.value)} className="h-11 w-full rounded-xl border border-field bg-card px-3 text-[15px] outline-none focus:border-moss" />}
      </Field>
      {probe.trim() && (
        <p role="status" className={hit ? "text-[13.5px] font-semibold text-danger" : "text-[13.5px] text-moss-ink"}>
          {hit ? `Würde ausgeblendet (Treffer: „${hit}“).` : "Würde normal erscheinen."}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!pro || pending || tooMany || !changed}>
          {pending ? "Speichert …" : "Wortfilter speichern"}
        </Button>
        {!pro && (
          <Link href={proHref("kommentare")} className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
            Mit Creator Pro freischalten →
          </Link>
        )}
      </div>
    </form>
  );
}

type Hidden = { id: string; body: string; createdAt: string; author: { handle: string; displayName: string; avatarUrl: string | null }; target: { type: string; title: string; href: string } };

const TYPE_LABEL: Record<string, string> = { POST: "Beitrag", PROJECT: "Projekt", TUTORIAL: "Anleitung", ARTICLE: "Artikel" };

/** Ausgeblendete Kommentare: einblenden oder endgültig entfernen */
export function FilteredCommentList({ items }: { items: Hidden[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const run = (fn: () => ReturnType<typeof callAction>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast(r.error, "error");
      toast(r.message ?? "");
      router.refresh();
    });
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((c) => (
        <li key={c.id} className="flex gap-3 py-4">
          <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">
              <Link href={`/u/${c.author.handle}`} className="font-semibold text-ink hover:underline">
                {c.author.displayName}
              </Link>{" "}
              · <RelativeTime date={c.createdAt} /> · {TYPE_LABEL[c.target.type] ?? "Inhalt"}{" "}
              <Link href={c.target.href} className="text-ink-2 underline-offset-2 hover:underline">
                {c.target.title || "ohne Titel"}
              </Link>
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-[14.5px] text-ink-2">{c.body}</p>
            <div className="mt-2 flex gap-4">
              <button type="button" className="text-[13px] font-semibold text-moss-ink hover:underline" onClick={() => run(() => callAction(() => unfilterCommentAction(c.id)))}>
                Einblenden
              </button>
              <button type="button" className="text-[13px] text-muted hover:text-danger" onClick={() => run(() => callAction(() => deleteCommentAction(c.id)))}>
                Entfernen
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * „Bestehende Kommentare prüfen“: zählt zuerst (ohne etwas zu ändern), dann nach Rückfrage ausblenden.
 * Gilt für die gespeicherte Wortliste.
 */
export function RetroFilterButton({ pro, hasWords }: { pro: boolean; hasWords: boolean }) {
  const router = useRouter();
  // Kein useTransition: ein Bestätigungsdialog innerhalb einer Transition bleibt leer
  const [pending, setPending] = useState(false);
  const check = async () => {
    setPending(true);
    try {
      const dry = await callAction(() => applyCommentFilterAction(true));
      if (!dry.ok) return toast(dry.error, "error");
      if (!dry.data.matched) return toast(dry.data.scanned ? "Keine bestehenden Kommentare treffen deinen Wortfilter." : "Unter deinen Inhalten gibt es noch keine Kommentare zum Prüfen.");
      const n = dry.data.matched;
      const ok = await confirmDialog({
        title: `${n === 1 ? "1 Kommentar" : `${n} Kommentare`} ausblenden?`,
        body: `${n === 1 ? "Dieser Kommentar enthält" : "Diese Kommentare enthalten"} ein Wort deines Filters. Ausgeblendet sehen nur die jeweilige Person und du sie; du kannst sie unten jederzeit wieder einblenden.${dry.data.limited ? " Geprüft wurden die neuesten Kommentare – führe die Prüfung danach bei Bedarf erneut aus." : ""}`,
        confirmLabel: "Ausblenden",
        tone: "danger",
      });
      if (!ok) return;
      const r = await callAction(() => applyCommentFilterAction(false));
      if (!r.ok) return toast(r.error, "error");
      toast(r.data.hidden === 1 ? "1 Kommentar ausgeblendet." : `${r.data.hidden} Kommentare ausgeblendet.`);
      router.refresh();
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="text-[14px] font-semibold">Bestehende Kommentare prüfen</p>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        Der Filter wirkt auf neue Kommentare. Mit dieser Prüfung wendest du die gespeicherte Wortliste auch auf bisherige Kommentare unter deinen Inhalten an – du
        siehst vorher, wie viele es betrifft.
      </p>
      <Button type="button" variant="outline" className="mt-3" disabled={!pro || !hasWords || pending} onClick={() => void check()}>
        {pending ? "Wird geprüft …" : "Bestehende Kommentare prüfen"}
      </Button>
      {pro && !hasWords && <p className="mt-2 text-[12.5px] text-muted">Speichere zuerst mindestens ein Wort.</p>}
    </div>
  );
}
