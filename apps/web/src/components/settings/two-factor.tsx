"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { confirmMfaSetupAction, disableMfaAction, regenerateRecoveryCodesAction, startMfaSetupAction, verifySessionMfaAction } from "@/app/(app)/einstellungen/actions";
import { AppleReauthNotice } from "@/components/settings/apple-reauth";
import { BRAND } from "@/config/brand";

type Setup = { qrSvg: string; secret: string; uri: string };

/** 6-stelliges Codefeld (nur Ziffern, Autofill aus SMS/Passwort-Apps). */
function CodeInput({ value, onChange, error, label = "Code aus der App" }: { value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  return (
    <Field label={label} error={error}>
      {(p) => (
        <Input
          {...p}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          className="max-w-48 text-center font-mono text-lg tracking-[0.4em]"
        />
      )}
    </Field>
  );
}

function RecoveryCodes({ codes, email, onDone }: { codes: string[]; email: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `${BRAND.name} – Wiederherstellungscodes\nKonto: ${email}\nErstellt: ${new Date().toLocaleString("de-CH")}\n\nJeder Code funktioniert genau einmal.\n\n${codes.join("\n")}\n`;
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={16} aria-hidden /> Deine Wiederherstellungscodes
      </p>
      <p className="mt-1.5 text-sm text-muted">
        Damit kommst du in dein Konto, wenn du dein Handy verlierst. Bewahre sie an einem sicheren Ort auf, zum Beispiel in deinem Passwort-Manager. <span className="font-semibold text-ink">Sie werden nur jetzt angezeigt.</span>
      </p>
      <ol className="mt-4 grid max-w-md grid-cols-2 gap-2">
        {codes.map((c) => (
          <li key={c} className="whitespace-nowrap rounded-xl bg-sunken px-3 py-2 text-center font-mono text-sm tracking-wide">
            {c}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
              toast("Codes kopiert.");
            } catch {
              toast("Kopieren nicht möglich – lade die Codes herunter oder schreib sie ab.", "error");
            }
          }}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Kopieren
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = "werkuno-wiederherstellungscodes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download size={14} aria-hidden /> Als Datei speichern
        </Button>
        <Button size="sm" onClick={onDone} className="ml-auto">
          Ich habe sie gesichert
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorSettings({
  enabled,
  enabledAt,
  recoveryCodesLeft,
  required,
  email,
  hasPassword,
  reauthFresh,
}: {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  required: boolean;
  email: string;
  /** Ein- und Ausschalten braucht das Passwort bzw. (ohne Passwort) eine frische Anmeldung mit Apple */
  hasPassword: boolean;
  reauthFresh: boolean;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [manage, setManage] = useState<"regen" | "disable" | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);

  const start = useAction(startMfaSetupAction, {
    refresh: false,
    onSuccess: (d) => {
      setSetup(d);
      setPassword("");
      setAskPassword(false);
    },
  });
  const confirm = useAction(confirmMfaSetupAction, {
    onSuccess: (d) => {
      setSetup(null);
      setCode("");
      setCodes(d.recoveryCodes);
    },
  });
  const regen = useAction(regenerateRecoveryCodesAction, {
    onSuccess: (d) => {
      setManage(null);
      setCode("");
      setCodes(d.recoveryCodes);
    },
  });
  const disable = useAction(disableMfaAction, {
    onSuccess: () => {
      setManage(null);
      setCode("");
      setPassword("");
    },
  });
  const appleReauthNeeded = !hasPassword && (!reauthFresh || !!start.fields.reauth || !!disable.fields.reauth);
  const passwordField = (error?: string) =>
    hasPassword ? (
      <Field label="Aktuelles Passwort" hint="Zur Sicherheit bestätigst du diesen Schritt mit deinem Passwort." error={error}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-sm" />}
      </Field>
    ) : null;

  if (codes) return <RecoveryCodes codes={codes} email={email} onDone={() => setCodes(null)} />;

  if (enabled) {
    const busy = regen.pending || disable.pending;
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss-soft text-moss">
            <ShieldCheck size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              Authenticator-App <Badge tone="moss">Aktiv</Badge>
            </p>
            <p className="text-xs text-muted">
              {enabledAt && `Seit ${formatDate(new Date(enabledAt), { day: "numeric", month: "long", year: "numeric" })} · `}
              {recoveryCodesLeft} von 10 Wiederherstellungscodes übrig
            </p>
          </div>
          {!manage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setManage("regen")}>
                Neue Codes erstellen
              </Button>
              {!required && (
                <Button variant="ghost" size="sm" onClick={() => setManage("disable")}>
                  Deaktivieren
                </Button>
              )}
            </div>
          )}
        </div>
        {recoveryCodesLeft <= 3 && !manage && (
          <Notice tone="warn" className="mt-4">
            Dir bleiben nur noch wenige Wiederherstellungscodes. Erstelle neue, damit du dich bei Verlust deines Handys weiter anmelden kannst.
          </Notice>
        )}
        {manage && (
          <form
            className="mt-5 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (manage === "regen") regen.run(code);
              else disable.run(code, password);
            }}
          >
            <p className="mb-4 text-sm text-muted">
              {manage === "regen"
                ? "Bestätige mit dem aktuellen Code aus deiner App. Deine bisherigen Wiederherstellungscodes werden dabei ungültig."
                : "Bestätige mit dem aktuellen Code aus deiner App. Danach reicht wieder dein Passwort zum Anmelden."}
            </p>
            {manage === "disable" && appleReauthNeeded && (
              <div className="mb-4">
                <AppleReauthNotice returnTo="/einstellungen/sicherheit#zwei-faktor" action="die Zwei-Faktor-Anmeldung ausschalten kann" />
              </div>
            )}
            <CodeInput value={code} onChange={setCode} error={(manage === "regen" ? regen : disable).fields.code} />
            {manage === "disable" && <div className="mt-4">{passwordField(disable.fields.password)}</div>}
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm" variant={manage === "disable" ? "danger" : "primary"} disabled={busy || code.length !== 6 || (manage === "disable" && ((hasPassword && !password) || appleReauthNeeded))}>
                {manage === "regen" ? "Codes neu erstellen" : "Zwei-Faktor deaktivieren"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setManage(null);
                  setCode("");
                  setPassword("");
                }}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        )}
        {required && <p className="mt-4 text-xs text-muted">Für Moderations- und Admin-Konten ist die Zwei-Faktor-Anmeldung Pflicht und kann nicht deaktiviert werden.</p>}
      </div>
    );
  }

  if (setup) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <ol className="space-y-6">
          <li>
            <p className="text-sm font-semibold">1. Code scannen</p>
            <p className="mt-1 text-sm text-muted">Öffne eine Authenticator-App (z. B. Apple Passwörter, Google Authenticator, 1Password oder Microsoft Authenticator) und scanne den QR-Code.</p>
            <div className="mt-4 flex flex-wrap items-start gap-5">
              <div className="size-44 shrink-0 rounded-2xl border border-line bg-white p-3 [&>svg]:size-full" role="img" aria-label="QR-Code zur Einrichtung" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <p className="text-muted">Scannen nicht möglich? Gib diesen Schlüssel von Hand ein:</p>
                <p className="break-all rounded-xl bg-sunken px-3 py-2 font-mono text-[13px] tracking-wide select-all">{setup.secret}</p>
                <a href={setup.uri} className="inline-flex items-center gap-1.5 font-semibold text-moss underline-offset-4 hover:underline sm:hidden">
                  <Smartphone size={14} aria-hidden /> In der App auf diesem Gerät öffnen
                </a>
              </div>
            </div>
          </li>
          <li>
            <p className="text-sm font-semibold">2. Code bestätigen</p>
            <p className="mt-1 mb-4 text-sm text-muted">Gib den 6-stelligen Code ein, den die App jetzt anzeigt.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirm.run(code);
              }}
            >
              <CodeInput value={code} onChange={setCode} error={confirm.fields.code} />
              <div className="mt-4 flex gap-2">
                <Button type="submit" disabled={confirm.pending || code.length !== 6}>
                  {confirm.pending ? "Wird geprüft …" : "Aktivieren"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSetup(null);
                    setCode("");
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </form>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sunken text-ink-2">
          <Smartphone size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            Authenticator-App {required ? <Badge tone="danger">Erforderlich</Badge> : <Badge>Aus</Badge>}
          </p>
          <p className="text-xs text-muted">Bei jeder Anmeldung zusätzlich ein Code von deinem Handy.</p>
        </div>
        {!askPassword && !appleReauthNeeded && (
          <Button onClick={() => (hasPassword ? setAskPassword(true) : start.run({}))} disabled={start.pending}>
            {start.pending ? "Wird vorbereitet …" : "Einrichten"}
          </Button>
        )}
      </div>
      {appleReauthNeeded && (
        <div className="mt-4">
          <AppleReauthNotice returnTo="/einstellungen/sicherheit#zwei-faktor" action="die Zwei-Faktor-Anmeldung einrichten kann" />
        </div>
      )}
      {askPassword && (
        <form
          className="mt-5 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            start.run({ password });
          }}
        >
          {passwordField(start.fields.password)}
          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" disabled={start.pending || !password}>
              {start.pending ? "Wird vorbereitet …" : "Weiter"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAskPassword(false);
                setPassword("");
              }}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Ältere Sitzung nachträglich mit dem zweiten Faktor bestätigen (Voraussetzung für Admin/Moderation). */
export function ConfirmSessionMfa({ next }: { next: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const confirm = useAction(verifySessionMfaAction, {
    onSuccess: () => {
      setCode("");
      if (next) router.push(next);
    },
  });
  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm.run({ code });
      }}
    >
      <CodeInput value={code} onChange={setCode} error={confirm.fields.code} />
      <Button type="submit" size="sm" className="mt-3" disabled={confirm.pending || code.length !== 6}>
        {confirm.pending ? "Wird geprüft …" : "Sitzung bestätigen"}
      </Button>
    </form>
  );
}
