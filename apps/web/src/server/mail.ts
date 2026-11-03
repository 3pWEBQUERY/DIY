import "server-only";
import { env, features } from "@/server/env";
import { BRAND } from "@/config/brand";

/** E-Mail-Adapter: Resend in Produktion, Konsole in Entwicklung (§25.8 externe Dienste über Adapter). */
export async function sendMail(to: string, subject: string, text: string, opts: { cta?: { label: string; url: string } } = {}) {
  const e = env();
  const html = renderMail(subject, text, opts.cta);
  if (!features.email()) {
    console.info(JSON.stringify({ level: "info", msg: "mail (dev)", to: to.replace(/(.{2}).*@/, "$1…@"), subject, cta: opts.cta?.url }));
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.MAIL_FROM, to, subject, text: opts.cta ? `${text}\n\n${opts.cta.label}: ${opts.cta.url}` : text, html }),
  });
  if (!res.ok) throw new Error(`Mailversand fehlgeschlagen (${res.status})`);
  return { delivered: true };
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
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#3D604C;color:#fff;padding:12px 20px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="de"><body style="margin:0;background:#FAF9F6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#252822">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E3E4DE">
<tr><td style="padding:20px 28px;border-bottom:1px solid #E3E4DE;font-weight:700;letter-spacing:.18em;font-size:12px">${BRAND.name}</td></tr>
<tr><td style="padding:28px"><h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 16px">${esc(subject)}</h1>${paragraphs}${button}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E3E4DE;font-size:12px;color:#73766E">Du erhältst diese E-Mail, weil du ein Konto bei ${BRAND.name} hast. Benachrichtigungen kannst du in den Einstellungen anpassen.</td></tr>
</table></td></tr></table></body></html>`;
}
