import "server-only";
import { env, features } from "@/server/env";
import { BRAND } from "@/config/brand";

/** E-Mail-Adapter: Resend in Produktion, Konsole in Entwicklung (§25.8 externe Dienste über Adapter). */
export async function sendMail(to: string, subject: string, text: string, opts: { cta?: { label: string; url: string } } = {}) {
  const e = env();
  const html = renderMail(subject, text, opts.cta);
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
      body: JSON.stringify({ from: e.MAIL_FROM, to, subject, text: opts.cta ? `${text}\n\n${opts.cta.label}: ${opts.cta.url}` : text, html }),
    });
    if (!res.ok) {
      // Kein Throw: Registrierung/Passwort-Reset dürfen nicht an einem Mail-Ausfall scheitern
      // (sonst halbe Konten bzw. erkennbare E-Mail-Adressen). Fehler wird geloggt und in der
      // Fehlerüberwachung gesammelt – mit der Begründung von Resend (z. B. Domain nicht bestätigt).
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

function renderMail(subject: string, text: string, cta?: { label: string; url: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#B64B3A;color:#fff;padding:12px 20px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="de"><body style="margin:0;background:#FAF8F5;font-family:Manrope,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#262427">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E7E2DE">
<tr><td style="padding:20px 28px;border-bottom:1px solid #E7E2DE;font-weight:700;letter-spacing:.18em;font-size:12px">${BRAND.name}</td></tr>
<tr><td style="padding:28px"><h1 style="font-family:Manrope,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;margin:0 0 16px">${esc(subject)}</h1>${paragraphs}${button}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E7E2DE;font-size:12px;color:#6B6461">Du erhältst diese E-Mail, weil du ein Konto bei ${BRAND.name} hast. Benachrichtigungen kannst du in den Einstellungen anpassen.</td></tr>
</table></td></tr></table></body></html>`;
}
