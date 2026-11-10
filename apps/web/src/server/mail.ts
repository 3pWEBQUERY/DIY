import "server-only";
import { env, features } from "@/server/env";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_ADDRESS } from "@/config/legal";

/** E-Mail-Adapter: Resend in Produktion, Konsole in Entwicklung (§25.8 externe Dienste über Adapter). */
export async function sendMail(to: string, subject: string, text: string, opts: MailOptions = {}) {
  const e = env();
  const html = renderMail(subject, text, opts);
  const masked = to.replace(/(.{2}).*@/, "$1…@");
  if (!features.email()) {
    // Links (enthalten Einmal-Tokens für Passwort/Verifizierung) nur lokal ausgeben – nie in Produktions-Logs
    const dev = e.NODE_ENV !== "production";
    console.info(JSON.stringify({ level: dev ? "info" : "warn", msg: dev ? "mail (dev)" : "mail_disabled_no_resend_key", to: masked, subject, ...(dev ? { cta: opts.cta?.url } : {}) }));
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: e.MAIL_FROM,
        to,
        subject,
        text: plainText(text, opts),
        html,
        // Abmelden mit einem Klick direkt im Postfach (RFC 8058) – nur bei Benachrichtigungs-Mails
        ...(opts.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${opts.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      }),
    });
    if (!res.ok) {
      // Kein Throw: Registrierung/Passwort-Reset dürfen nicht an einem Mail-Ausfall scheitern
      // (sonst halbe Konten bzw. erkennbare E-Mail-Adressen). Fehler wird geloggt und in der
      // Fehlerüberwachung gesammelt – mit der Begründung von Resend (z.B. Domain nicht bestätigt).
      const reason = await resendError(res);
      console.error(JSON.stringify({ level: "error", msg: "mail_failed", status: res.status, reason, to: masked, subject }));
      await reportMailFailure(`Resend ${res.status}: ${reason}`);
      return { delivered: false, failed: true, status: res.status, reason };
    }
    return { delivered: true };
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "mail_failed", error: String(err).slice(0, 200), to: masked, subject }));
    await reportMailFailure(String(err).slice(0, 200));
    return { delivered: false, failed: true, reason: "Resend nicht erreichbar" };
  }
}

function plainText(text: string, opts: MailOptions) {
  const parts = [text];
  if (opts.items?.length) parts.push(opts.items.map((i) => `• ${i.text}${i.excerpt ? `\n  „${i.excerpt}“` : ""}${i.url ? `\n  ${i.url}` : ""}`).join("\n\n"));
  if (opts.cta) parts.push(`${opts.cta.label}: ${opts.cta.url}`);
  parts.push(`—\n${BRAND.name} · ${BRAND.claim}\n${LEGAL.company} · ${LEGAL_ADDRESS} · ${BRAND.supportEmail}${opts.unsubscribeUrl ? `\nE-Mails abbestellen: ${opts.unsubscribeUrl}` : ""}`);
  return parts.join("\n\n");
}

/** Fehlermeldung von Resend lesbar machen (enthält keine Geheimnisse). */
async function resendError(res: Response) {
  try {
    const j = (await res.json()) as { message?: string; name?: string };
    return (j.message ?? j.name ?? res.statusText).slice(0, 300);
  } catch {
    return res.statusText || "Unbekannter Fehler";
  }
}

async function reportMailFailure(message: string) {
  try {
    const { captureError } = await import("@/server/monitoring");
    const e = new Error(message);
    e.name = "MailDeliveryError";
    await captureError(e, { source: "SERVER", path: "mail" });
  } catch {
    /* Überwachung darf den Versand nicht stören */
  }
}

/** Zustand des Mailversands für die Administration: Schlüssel, Absender, Domain bei Resend. */
export async function mailStatus() {
  const e = env();
  const from = e.MAIL_FROM;
  const domain = /@([^>\s]+)>?\s*$/.exec(from)?.[1]?.toLowerCase() ?? null;
  if (!features.email()) return { configured: false as const, from, domain, domainStatus: null as string | null, note: "RESEND_API_KEY fehlt – es werden keine E-Mails verschickt." };
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${e.RESEND_API_KEY}` } });
    if (res.status === 401 || res.status === 403) {
      // Schlüssel nur mit Senderecht: Domainliste nicht lesbar – Versand trotzdem möglich
      return { configured: true as const, from, domain, domainStatus: null, note: "Der Schlüssel darf nur senden; den Domain-Status siehst du im Resend-Dashboard. Prüfe mit einer Test-E-Mail." };
    }
    if (!res.ok) return { configured: true as const, from, domain, domainStatus: null, note: `Resend antwortet mit ${res.status}: ${await resendError(res)}` };
    const j = (await res.json()) as { data?: { name: string; status: string; region?: string }[] };
    const d = j.data?.find((x) => x.name.toLowerCase() === domain);
    return {
      configured: true as const,
      from,
      domain,
      domainStatus: d?.status ?? "missing",
      note: !d ? `Die Domain ${domain} ist bei Resend nicht eingerichtet – E-Mails von ${from} werden abgelehnt.` : d.status === "verified" ? null : `Die Domain ${domain} ist bei Resend noch nicht bestätigt (Status: ${d.status}). DNS-Einträge (SPF/DKIM) bei deinem Domain-Anbieter setzen und in Resend prüfen.`,
    };
  } catch (err) {
    return { configured: true as const, from, domain, domainStatus: null, note: `Resend nicht erreichbar: ${String(err).slice(0, 120)}` };
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Farben und Schrift wie auf der Website (globals.css). */
const C = {
  paper: "#faf8f5",
  card: "#ffffff",
  sunken: "#f3efeb",
  ink: "#262427",
  ink2: "#3d393c",
  muted: "#6b6461",
  line: "#e7e2de",
  coral: "#b64b3a",
  coralSoft: "#f6e5e0",
};
const FONT = `Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;

export type MailItem = { text: string; excerpt?: string; url?: string };
export type MailOptions = {
  cta?: { label: string; url: string };
  /** Kleine Überschrift über dem Titel (wie auf der Website, z. B. „Konto & Sicherheit“). */
  eyebrow?: string;
  /** Titel in der Mail, falls er vom Betreff abweichen soll. */
  heading?: string;
  /** Vorschautext in der Postfach-Liste. */
  preheader?: string;
  /** Liste von Ereignissen (Benachrichtigungen) als Karten. */
  items?: MailItem[];
  /** Benachrichtigungs-Mails: Abmeldelink (Fusszeile + List-Unsubscribe-Header). */
  unsubscribeUrl?: string;
};

/** Text in Absätze; einfache Aufzählungen („• “) werden zu Listenpunkten. */
function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split("\n");
      if (lines.every((l) => /^[•\-–] /.test(l))) {
        return `<ul style="margin:0 0 18px;padding:0 0 0 20px">${lines.map((l) => `<li style="margin:0 0 6px;font-size:16px;line-height:1.6;color:${C.ink2}">${esc(l.replace(/^[•\-–] /, ""))}</li>`).join("")}</ul>`;
      }
      return `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${C.ink2}">${esc(p).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function itemCards(items: MailItem[]) {
  const rows = items
    .map((it) => {
      const excerpt = it.excerpt ? `<div style="margin-top:6px;font-size:14px;line-height:1.55;color:${C.muted}">„${esc(it.excerpt)}“</div>` : "";
      const body = `<div style="font-size:15px;line-height:1.5;color:${C.ink};font-weight:600">${esc(it.text)}</div>${excerpt}`;
      const inner = it.url ? `<a href="${esc(it.url)}" style="text-decoration:none;color:${C.ink};display:block">${body}</a>` : body;
      return `<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sunken};border-radius:12px"><tr><td style="padding:14px 16px;border-left:3px solid ${C.coral};border-radius:12px">${inner}</td></tr></table></td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px">${rows}</table>`;
}

function button(cta: { label: string; url: string }) {
  const url = esc(cta.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="background:${C.coral};border-radius:12px">
<a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px">${esc(cta.label)}&nbsp;&rarr;</a>
</td></tr></table>
<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${C.muted}">Funktioniert der Button nicht? Öffne diesen Link:<br><a href="${url}" style="color:${C.coral};word-break:break-all">${url}</a></p>`;
}

export function renderMail(subject: string, text: string, opts: MailOptions = {}) {
  const app = env().APP_URL.replace(/\/$/, "");
  const heading = opts.heading ?? subject;
  const preheader = opts.preheader ?? text.replace(/\s+/g, " ").slice(0, 140);
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 14px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.ink2}"><span style="display:inline-block;width:7px;height:7px;background:${C.coral};border-radius:50%;vertical-align:1px;margin-right:9px"></span>${esc(opts.eyebrow)}</p>`
    : "";
  const footerLinks = [
    opts.unsubscribeUrl ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;white-space:nowrap">E-Mails abbestellen</a>` : null,
    `<a href="${app}/einstellungen/benachrichtigungen" style="color:${C.muted};text-decoration:underline;white-space:nowrap">Benachrichtigungen</a>`,
    `<a href="${app}/hilfe" style="color:${C.muted};text-decoration:underline;white-space:nowrap">Hilfe</a>`,
    `<a href="${app}/rechtliches/datenschutz" style="color:${C.muted};text-decoration:underline;white-space:nowrap">Datenschutz</a>`,
  ]
    .filter(Boolean)
    .join(`&nbsp;· `);
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>body{margin:0;padding:0}a{color:${C.coral}}@media (max-width:620px){.wk-pad{padding:28px 22px!important}.wk-h1{font-size:26px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:36px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="padding:0 4px 22px"><a href="${app}" style="text-decoration:none"><img src="${app}/brand/werkuno-wordmark-email.png" width="140" height="22" alt="${BRAND.name}" style="display:block;border:0;width:140px;height:auto"></a></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="wk-pad" style="padding:40px 40px 34px;font-family:${FONT}">
${eyebrow}<h1 class="wk-h1" style="margin:0 0 18px;font-family:${FONT};font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:${C.ink}">${esc(heading)}</h1>
${paragraphs(text)}${opts.items?.length ? itemCards(opts.items) : ""}${opts.cta ? button(opts.cta) : ""}
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
<p style="margin:0 0 10px;font-weight:700;color:${C.ink2}">${esc(BRAND.claim)}</p>
<p style="margin:0 0 10px">${footerLinks}</p>
<p style="margin:0 0 10px">Du erhältst diese E-Mail, weil du ein Konto bei ${BRAND.name} hast. Fragen? <a href="mailto:${BRAND.supportEmail}" style="color:${C.muted}">${BRAND.supportEmail}</a></p>
<p style="margin:0">${esc(BRAND.name)} · ${esc(LEGAL.company)} · ${esc(LEGAL_ADDRESS)} · <a href="${app}/rechtliches/impressum" style="color:${C.muted};text-decoration:underline">Impressum</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
