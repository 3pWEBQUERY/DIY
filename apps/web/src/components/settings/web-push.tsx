"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { registerWebPushAction, unregisterWebPushAction, webPushKeyAction } from "@/app/(app)/einstellungen/actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function b64ToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Zustand und Schalter für Push in diesem Browser (Hook, von Karte und Hinweis genutzt). */
function useWebPush() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported()) {
      // iPhone/iPad: Web Push nur in der zum Home-Bildschirm hinzugefügten Web-App
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      return setState(ios ? "ios-install" : "unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission === "denied") toast("Push ist im Browser blockiert. Erlaube Benachrichtigungen in den Website-Einstellungen.", "error");
        return;
      }
      const key = await webPushKeyAction();
      if (!key.ok) throw new Error(key.error);
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key.data.publicKey) }));
      const r = await registerWebPushAction(sub.toJSON());
      if (!r.ok) throw new Error(r.error);
      setState("on");
      toast("Push ist auf diesem Gerät aktiv.");
    } catch (e) {
      toast(e instanceof Error && e.message ? `Push konnte nicht aktiviert werden: ${e.message}` : "Push konnte nicht aktiviert werden.", "error");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unregisterWebPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Push auf diesem Gerät ausgeschaltet.");
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, enable, disable };
}

/** Karte in den Benachrichtigungs-Einstellungen. */
export function WebPushCard() {
  const { state, busy, enable, disable } = useWebPush();
  const text: Record<State, string> = {
    loading: "Wird geprüft …",
    unsupported: "Dieser Browser unterstützt keine Push-Benachrichtigungen.",
    "ios-install": "Auf dem iPhone und iPad funktioniert Push, wenn du Werkuno zum Home-Bildschirm hinzufügst (Teilen → „Zum Home-Bildschirm“) und von dort öffnest.",
    denied: "Benachrichtigungen sind für werkuno.ch im Browser blockiert. Erlaube sie in den Website-Einstellungen (Schloss-Symbol in der Adresszeile) und lade die Seite neu.",
    off: "Erhalte Nachrichten, Bestellungen und Antworten sofort – auch wenn Werkuno nicht geöffnet ist. Gilt nur für dieses Gerät.",
    on: "Aktiv auf diesem Gerät. Welche Ereignisse du bekommst, steuerst du unten unter „In der App“.",
  };
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 sm:flex-row sm:items-center">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", state === "on" ? "bg-moss text-paper" : "bg-sunken text-muted")} aria-hidden>
        <BellRing size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Push-Benachrichtigungen in diesem Browser</p>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{text[state]}</p>
      </div>
      {(state === "off" || state === "on") && (
        <Button variant={state === "on" ? "outline" : "primary"} onClick={() => void (state === "on" ? disable() : enable())} disabled={busy} className="shrink-0">
          {busy && <Loader2 size={14} className="animate-spin" />}
          {state === "on" ? "Ausschalten" : "Aktivieren"}
        </Button>
      )}
    </div>
  );
}

const DISMISS = "wr_push_prompt";

/** Dezenter Hinweis auf der Benachrichtigungsseite – nur wenn sinnvoll und nicht weggeklickt. */
export function WebPushPrompt() {
  const { state, busy, enable } = useWebPush();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed || state !== "off" || (supported() && Notification.permission !== "default")) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS, "1");
    } catch {}
  };
  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
      <BellRing size={18} className="shrink-0 text-moss" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px]">Nichts mehr verpassen: Push-Benachrichtigungen für diesen Browser aktivieren?</p>
      <Button size="sm" onClick={() => void enable()} disabled={busy}>
        {busy && <Loader2 size={13} className="animate-spin" />} Aktivieren
      </Button>
      <button type="button" onClick={hide} className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label="Hinweis ausblenden">
        <X size={15} />
      </button>
    </div>
  );
}
