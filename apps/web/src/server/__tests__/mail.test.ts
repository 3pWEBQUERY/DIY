import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({
  env: () => ({ APP_URL: "https://werkuno.ch", SESSION_SECRET: "x".repeat(40), NODE_ENV: "test", MAIL_FROM: "Werkuno <hallo@werkuno.ch>" }),
  features: { email: () => false },
}));
vi.mock("@/server/db", () => ({ db: {} }));
const { renderMail } = await import("../mail");
const { unsubscribeUrl, verifyUnsubscribeToken } = await import("../mail-unsubscribe");

describe("E-Mail-Layout", () => {
  it("zeigt Logo, Titel, Button und maskiert HTML", () => {
    const html = renderMail("Test <b>", "Hallo <script>x</script>\n\nZweiter Absatz", { eyebrow: "Konto", cta: { label: "Los", url: "https://werkuno.ch/a?b=1&c=2" } });
    expect(html).toContain('src="https://werkuno.ch/brand/werkuno-logo-email.png"');
    expect(html).toContain("Test &lt;b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://werkuno.ch/a?b=1&amp;c=2");
    expect(html).toContain("Konto");
    expect(html).not.toContain("abbestellen");
  });

  it("Benachrichtigungen: Einträge als Karten, Abmeldelink nur wenn angegeben", () => {
    const html = renderMail("2 Neuigkeiten", "Das ist passiert:", { items: [{ text: "Lena gefällt dein Projekt.", url: "https://werkuno.ch/p" }, { text: "Neuer Kommentar", excerpt: "Toll!" }], unsubscribeUrl: unsubscribeUrl("user1") });
    expect(html).toContain("Lena gefällt dein Projekt.");
    expect(html).toContain("„Toll!“");
    expect(html).toContain("E-Mails abbestellen");
  });

  it("Abmelde-Token ist an das Konto gebunden", () => {
    const t = new URL(unsubscribeUrl("user1")).searchParams.get("t")!;
    expect(verifyUnsubscribeToken(t)).toBe("user1");
    expect(verifyUnsubscribeToken(t.replace("user1", "user2"))).toBeNull();
    expect(verifyUnsubscribeToken("user1.falsch")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });
});
