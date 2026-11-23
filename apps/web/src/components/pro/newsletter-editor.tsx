"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Eye,
  ImagePlus,
  Mail,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/misc";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import {
  CARD_KINDS,
  NEWSLETTER_BODY_MAX,
  NEWSLETTER_CARDS_MAX,
  NEWSLETTER_STATUS_LABEL,
  NEWSLETTER_SUBJECT_MAX,
  cardToken,
  extractCardRefs,
  stripCardRefs,
  type CardKind,
  type CardRef,
  type NewsletterStatus,
} from "@/lib/newsletter";
import {
  deleteNewsletterAction,
  previewNewsletterAction,
  saveNewsletterAction,
  scheduleNewsletterAction,
  unscheduleNewsletterAction,
} from "@/app/studio/newsletter/actions";

type Option = { id: string; title: string; coverUrl: string | null };
type Options = Record<CardKind, Option[]>;

const KIND_LABEL: Record<CardKind, string> = {
  projekt: "Projekt",
  anleitung: "Anleitung",
  produkt: "Produkt",
};

/** datetime-local-Wert (lokale Zeit) für ein Datum */
function localValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });

/**
 * Newsletter schreiben: Betreff, Text, bis zu drei Karten zu eigenen Inhalten, Vorschau wie im Postfach.
 * Speichern als Entwurf, Vorschau an sich selbst, jetzt senden oder planen.
 */
export function NewsletterEditor({
  initial,
  options,
  creator,
  recipients,
  quotaLeft,
  quotaLimit,
}: {
  initial: {
    id: string | null;
    subject: string;
    body: string;
    status: NewsletterStatus;
    scheduledAt: string | null;
  };
  options: Options;
  creator: { displayName: string; handle: string };
  recipients: number;
  quotaLeft: number;
  quotaLimit: number;
}) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [subject, setSubject] = useState(initial.subject);
  const [text, setText] = useState(stripCardRefs(initial.body));
  const [cards, setCards] = useState<CardRef[]>(extractCardRefs(initial.body));
  const [status, setStatus] = useState<NewsletterStatus>(initial.status);
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [planAt, setPlanAt] = useState(() =>
    localValue(new Date(Date.now() + 24 * 3600_000)),
  );
  const [planning, setPlanning] = useState(false);
  const [picker, setPicker] = useState<CardKind | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const body = useMemo(
    () => [text.trim(), ...cards.map(cardToken)].filter(Boolean).join("\n\n"),
    [text, cards],
  );
  const locked = status === "SENDING" || status === "SENT";
  const first = creator.displayName.split(" ")[0] || creator.displayName;
  const find = (r: CardRef) => options[r.kind].find((o) => o.id === r.id);
  const canSend =
    !locked && quotaLeft > (status === "SCHEDULED" ? -1 : 0) && recipients > 0;

  /** Speichern (neu oder bestehend); gibt die ID zurück oder null bei Fehlern */
  async function save(silent = false): Promise<string | null> {
    const r = await callAction(() =>
      saveNewsletterAction(id, { subject, body }),
    );
    if (!r.ok) {
      setFields(r.fields ?? {});
      toast(r.error, "error");
      return null;
    }
    setFields({});
    if (!id) {
      setId(r.data.id);
      router.replace(`/studio/newsletter/${r.data.id}`);
    }
    if (!silent) toast(r.message ?? "Gespeichert.");
    return r.data.id;
  }

  const onSave = () => start(async () => void (await save()));

  const onPreview = () =>
    start(async () => {
      const r = await callAction(() =>
        previewNewsletterAction({ subject, body }),
      );
      if (!r.ok) {
        setFields(r.fields ?? {});
        return toast(r.error, "error");
      }
      toast(`Vorschau an ${r.data.to} verschickt.`);
    });

  // Rückfrage ausserhalb der Transition: deren Zustand würde sonst erst nach ihrem Ende gezeichnet
  const onSend = async (at: string | null) => {
    const label = at ? `am ${when(at)}` : "jetzt";
    const ok = await confirmDialog({
      title: at ? "Newsletter planen?" : "Newsletter jetzt senden?",
      body: `${recipients === 1 ? "1 Person bekommt" : `${recipients.toLocaleString("de-CH")} Personen bekommen`} „${subject.trim()}“ ${label} per E-Mail. Nach dem Versand lässt er sich nicht mehr ändern.${quotaLimit ? ` Du hast noch ${quotaLeft} von ${quotaLimit} Ausgaben in 30 Tagen.` : ""}`,
      confirmLabel: at ? "Planen" : "Jetzt senden",
    });
    if (!ok) return;
    start(async () => {
      const saved = await save(true);
      if (!saved) return;
      const r = await callAction(() => scheduleNewsletterAction(saved, { at }));
      if (!r.ok) {
        setFields(r.fields ?? {});
        return toast(r.error, "error");
      }
      setStatus("SCHEDULED");
      setScheduledAt(r.data.scheduledAt);
      setPlanning(false);
      toast(
        r.data.immediate
          ? `Wird verschickt – an ${r.data.recipients.toLocaleString("de-CH")} Personen.`
          : `Geplant für ${when(r.data.scheduledAt)}.`,
      );
      router.push("/studio/newsletter");
      router.refresh();
    });
  };

  const onUnschedule = () =>
    start(async () => {
      if (!id) return;
      const r = await callAction(() => unscheduleNewsletterAction(id));
      if (!r.ok) return toast(r.error, "error");
      setStatus("DRAFT");
      setScheduledAt(null);
      toast(r.message ?? "");
      router.refresh();
    });

  const onDelete = async () => {
    if (!id) return;
    if (
      !(await confirmDialog({
        title: "Newsletter löschen?",
        body: "Der Entwurf wird endgültig gelöscht.",
        confirmLabel: "Löschen",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const r = await callAction(() => deleteNewsletterAction(id));
      if (!r.ok) return toast(r.error, "error");
      toast(r.message ?? "");
      router.push("/studio/newsletter");
      router.refresh();
    });
  };

  const addCard = (ref: CardRef) => {
    setCards((c) =>
      c.some((x) => x.kind === ref.kind && x.id === ref.id) ||
      c.length >= NEWSLETTER_CARDS_MAX
        ? c
        : [...c, ref],
    );
    setPicker(null);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        {status !== "DRAFT" && (
          <Notice
            tone={status === "SCHEDULED" ? "moss" : "neutral"}
            title={NEWSLETTER_STATUS_LABEL[status]}
          >
            {status === "SCHEDULED" && scheduledAt
              ? `Wird am ${when(scheduledAt)} verschickt. Änderungen bis dahin speichern – oder den Versand zurückziehen.`
              : "Dieser Newsletter ist verschickt und lässt sich nicht mehr ändern."}
          </Notice>
        )}
        <Field
          label="Betreff"
          error={fields.subject}
          hint={`${subject.length}/${NEWSLETTER_SUBJECT_MAX} · Erscheint fett im Postfach`}
        >
          {(p) => (
            <Input
              {...p}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={NEWSLETTER_SUBJECT_MAX}
              disabled={locked}
              placeholder="Neu in der Werkstatt: …"
            />
          )}
        </Field>
        <Field
          label="Text"
          error={fields.body}
          hint={`${body.length.toLocaleString("de-CH")}/${NEWSLETTER_BODY_MAX.toLocaleString("de-CH")} · Leerzeile = neuer Absatz, „• “ am Zeilenanfang = Aufzählung`}
        >
          {(p) => (
            <Textarea
              {...p}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              disabled={locked}
              placeholder={`Hallo zusammen\n\nDiese Woche ist … entstanden. Was ich dabei gelernt habe: …\n\nHerzlich, ${first}`}
            />
          )}
        </Field>

        <div>
          <p className="mb-1.5 text-[14px] font-semibold">
            Karten zu deinen Inhalten
          </p>
          <p className="mb-3 text-[13px] text-muted">
            Bis zu {NEWSLETTER_CARDS_MAX} Projekte, Anleitungen oder Produkte –
            mit Bild und Link unter dem Text.
          </p>
          {cards.length > 0 && (
            <ul className="mb-3 space-y-2">
              {cards.map((r) => {
                const o = find(r);
                return (
                  <li
                    key={`${r.kind}:${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-card p-2 pr-3"
                  >
                    {o?.coverUrl ? (
                      <img
                        src={o.coverUrl}
                        alt=""
                        className="size-10 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="size-10 rounded-lg bg-sunken" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="spec block">{KIND_LABEL[r.kind]}</span>
                      <span className="block truncate text-[14px] font-semibold">
                        {o?.title ?? "Nicht mehr öffentlich"}
                      </span>
                    </span>
                    {!locked && (
                      <button
                        type="button"
                        className="text-muted hover:text-ink"
                        aria-label={`${o?.title ?? "Karte"} entfernen`}
                        onClick={() =>
                          setCards((c) => c.filter((x) => x !== r))
                        }
                      >
                        <X size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!locked && cards.length < NEWSLETTER_CARDS_MAX && (
            <div className="flex flex-wrap gap-2">
              {CARD_KINDS.map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  size="sm"
                  onClick={() => setPicker(picker === k ? null : k)}
                  aria-expanded={picker === k}
                  disabled={!options[k].length}
                >
                  <ImagePlus size={14} aria-hidden /> {KIND_LABEL[k]}
                </Button>
              ))}
            </div>
          )}
          {picker && (
            <ul
              className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-line bg-card"
              aria-label={`${KIND_LABEL[picker]} auswählen`}
            >
              {options[picker].map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => addCard({ kind: picker, id: o.id })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] hover:bg-sunken"
                  >
                    {o.coverUrl ? (
                      <img
                        src={o.coverUrl}
                        alt=""
                        className="size-8 rounded-md object-cover"
                      />
                    ) : (
                      <span className="size-8 rounded-md bg-sunken" />
                    )}
                    <span className="truncate">{o.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!locked && (
          <div className="space-y-3 border-t border-line pt-5">
            {recipients === 0 && (
              <p className="text-[13px] text-muted">
                Noch niemand kann deinen Newsletter empfangen – sobald dir
                Menschen folgen, kannst du senden.
              </p>
            )}
            {recipients > 0 && quotaLeft <= 0 && status !== "SCHEDULED" && (
              <p className="text-[13px] text-warn">
                Du hast diesen Monat schon {quotaLimit} Newsletter verschickt
                oder geplant. Der nächste ist möglich, sobald eine Ausgabe älter
                als 30 Tage ist.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onSave} disabled={pending}>
                Entwurf speichern
              </Button>
              <Button variant="ghost" onClick={onPreview} disabled={pending}>
                <Eye size={15} aria-hidden /> Vorschau an mich
              </Button>
              {status === "SCHEDULED" ? (
                <Button
                  variant="ghost"
                  onClick={onUnschedule}
                  disabled={pending}
                >
                  <Undo2 size={15} aria-hidden /> Versand zurückziehen
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setPlanning((v) => !v)}
                    disabled={pending || !canSend}
                    aria-expanded={planning}
                  >
                    <CalendarClock size={15} aria-hidden /> Planen
                  </Button>
                  <Button
                    onClick={() => onSend(null)}
                    disabled={pending || !canSend}
                  >
                    <Send size={15} aria-hidden /> Jetzt senden
                  </Button>
                </>
              )}
              {id && status !== "SCHEDULED" && (
                <Button
                  variant="ghost"
                  className="ml-auto text-danger"
                  onClick={onDelete}
                  disabled={pending}
                >
                  <Trash2 size={15} aria-hidden /> Löschen
                </Button>
              )}
            </div>
            {planning && (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
                <Field
                  label="Versand am"
                  error={fields.at}
                  className="min-w-[220px] flex-1"
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="datetime-local"
                      value={planAt}
                      min={localValue(new Date())}
                      onChange={(e) => setPlanAt(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  onClick={() =>
                    planAt && onSend(new Date(planAt).toISOString())
                  }
                  disabled={pending || !planAt}
                >
                  Planen
                </Button>
              </div>
            )}
            <p className="text-[12.5px] text-muted">
              Geht an {recipients.toLocaleString("de-CH")}{" "}
              {recipients === 1 ? "Person" : "Personen"}, die dir folgen und
              Newsletter nicht abbestellt haben. Jede Mail enthält einen
              Abmeldelink.
            </p>
          </div>
        )}
      </div>

      <MailPreview
        subject={subject}
        text={text}
        cards={cards.map((r) => find(r)).filter((o): o is Option => !!o)}
        creator={creator}
      />
    </div>
  );
}

/** Vorschau im Stil der Werkuno-Mails (vereinfacht) */
function MailPreview({
  subject,
  text,
  cards,
  creator,
}: {
  subject: string;
  text: string;
  cards: Option[];
  creator: { displayName: string };
}) {
  const first = creator.displayName.split(" ")[0] || creator.displayName;
  const paras = text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);
  return (
    <aside
      aria-label="Vorschau"
      className="min-w-0 lg:sticky lg:top-20 lg:self-start"
    >
      <p className="spec mb-3 flex items-center gap-2">
        <Mail size={13} aria-hidden /> Vorschau im Postfach
      </p>
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-2">
            <span className="mr-2 inline-block size-[7px] rounded-full bg-moss align-[1px]" />
            Newsletter von {creator.displayName}
          </p>
          <h2
            className={cn(
              "text-[26px] font-extrabold leading-tight tracking-tight",
              !subject.trim() && "text-muted",
            )}
          >
            {subject.trim() || "Dein Betreff"}
          </h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-2">
            {paras.length ? (
              paras.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))
            ) : (
              <p className="text-muted">Dein Text erscheint hier.</p>
            )}
          </div>
          {cards.length > 0 && (
            <div className="mt-6">
              <p className="spec mb-2">Neu von {first}</p>
              <div className="space-y-2">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-line p-2"
                  >
                    {c.coverUrl ? (
                      <img
                        src={c.coverUrl}
                        alt=""
                        className="size-14 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="size-14 rounded-lg bg-sunken" />
                    )}
                    <span className="text-[14px] font-semibold">{c.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <span className="mt-6 inline-block rounded-full bg-moss px-5 py-2.5 text-[14px] font-semibold text-paper">
            Profil von {first} ansehen
          </span>
        </div>
        <p className="mt-4 px-2 text-[12px] leading-relaxed text-muted">
          Du erhältst diesen Newsletter, weil du {creator.displayName} auf
          Werkuno folgst. ·{" "}
          <span className="underline">Newsletter von {first} abbestellen</span>
        </p>
      </div>
      <Badge tone="neutral" className="mt-3">
        Öffnungen und Klicks werden gezählt
      </Badge>
    </aside>
  );
}
