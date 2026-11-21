import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertMinor, currencyForCountry, currencyFromAcceptLanguage, formatMoney, fxFactor, roundTo10, signUpSchema, profileUpdateSchema } from "@werkraum/shared";

const upsert = vi.fn();
vi.mock("@/server/db", () => ({ db: { systemSetting: { upsert: (...a: unknown[]) => upsert(...a), findUnique: vi.fn() } } }));
vi.mock("@/server/auth/session", () => ({ currentUser: vi.fn() }));

const { localize, localizePrice, refreshFxRate, shopFxFor, isConverted } = await import("../currency");

describe("Land und Währung", () => {
  it("ordnet Länder der Währung zu", () => {
    expect(currencyForCountry("CH")).toBe("CHF");
    expect(currencyForCountry("LI")).toBe("CHF");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("AT")).toBe("EUR");
    expect(currencyForCountry(null)).toBe("CHF");
  });

  it("rät die Währung für Gäste aus der Sprache", () => {
    expect(currencyFromAcceptLanguage("de-DE,de;q=0.9")).toBe("EUR");
    expect(currencyFromAcceptLanguage("de-AT")).toBe("EUR");
    expect(currencyFromAcceptLanguage("de-CH,de;q=0.9")).toBe("CHF");
    expect(currencyFromAcceptLanguage("en-US")).toBe("CHF");
    expect(currencyFromAcceptLanguage(null)).toBe("CHF");
  });

  it("verlangt das Land bei Registrierung und im Profil", () => {
    const base = { displayName: "Ada", handle: "ada.test", email: "ada@example.com", password: "sehr-sicher-123", adult: true, terms: true };
    expect(signUpSchema.safeParse(base).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, country: "FR" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, country: "DE" }).success).toBe(true);
    const r = profileUpdateSchema.safeParse({ displayName: "Ada", handle: "ada.test", bio: "", links: [], categories: [] });
    expect(r.success).toBe(false);
  });
});

describe("Umrechnung", () => {
  it("rundet auf 10 Rappen/Cent, nie auf 0", () => {
    expect(roundTo10(9043)).toBe(9040);
    expect(roundTo10(9045)).toBe(9050);
    expect(roundTo10(3)).toBe(10);
    expect(roundTo10(0)).toBe(0);
  });

  it("rechnet CHF ↔ EUR zum Kurs (CHF je EUR)", () => {
    expect(convertMinor(8500, "CHF", "EUR", 0.94)).toBe(9040); // 85 / 0.94 = 90.43
    expect(convertMinor(9040, "EUR", "CHF", 0.94)).toBe(8500); // 90.40 × 0.94 = 84.98
    expect(convertMinor(8500, "CHF", "CHF", 0.94)).toBe(8500);
    expect(convertMinor(8500, "CHF", "EUR", 0)).toBe(8500); // ungültiger Kurs: unverändert
  });

  it("liefert den Faktor für die Shop-Währung", () => {
    expect(fxFactor("EUR", "CHF", 0.94)).toBeCloseTo(0.94);
    expect(fxFactor("CHF", "EUR", 0.94)).toBeCloseTo(1 / 0.94);
    expect(shopFxFor("EUR", "CHF", 0.94)).toBeCloseTo(0.94);
    expect(shopFxFor("CHF", "CHF", 0.94)).toBeNull();
  });

  it("lokalisiert Preise für Betrachter:innen und merkt sich den Shop-Preis", () => {
    const eur = { currency: "EUR" as const, eurChf: 0.94, fxDate: "2026-11-20" };
    expect(localize(eur, 8500, "CHF")).toBe(9040);
    expect(isConverted(eur, "CHF")).toBe(true);
    expect(localizePrice(eur, { priceMinor: 8500, currency: "CHF" })).toEqual({ priceMinor: 9040, currency: "EUR", original: { priceMinor: 8500, currency: "CHF" } });
    expect(localizePrice(eur, { priceMinor: 1200, currency: "EUR" })).toEqual({ priceMinor: 1200, currency: "EUR", original: null });
  });

  it("zeigt Euro mit Zeichen, Franken mit Code", () => {
    expect(formatMoney(9040, "EUR")).toMatch(/^€\s90\.40$/);
    expect(formatMoney(8500, "CHF")).toMatch(/^CHF\s85\.00$/);
    expect(formatMoney(8500, null)).toMatch(/^CHF\s85\.00$/);
  });
});

describe("EZB-Kurs laden", () => {
  beforeEach(() => upsert.mockReset());
  const xml = (rate: string) => `<gesmes:Envelope><Cube><Cube time='2026-11-20'><Cube currency='USD' rate='1.0512'/><Cube currency='CHF' rate='${rate}'/></Cube></Cube></gesmes:Envelope>`;
  const fetcher = (body: string, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 503, text: async () => body })) as unknown as typeof fetch;

  it("liest CHF-Kurs und Datum und speichert sie", async () => {
    const fx = await refreshFxRate(fetcher(xml("0.9387")));
    expect(fx).toMatchObject({ rate: 0.9387, date: "2026-11-20" });
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]![0]).toMatchObject({ where: { key: "fx.eurChf" }, update: { value: { rate: 0.9387, date: "2026-11-20" } } });
  });

  it("speichert nichts bei Fehlern oder unplausiblem Kurs", async () => {
    await expect(refreshFxRate(fetcher("", false))).rejects.toThrow(/nicht erreichbar/);
    await expect(refreshFxRate(fetcher(xml("94.1")))).rejects.toThrow(/nicht gefunden/);
    await expect(refreshFxRate(fetcher("<xml/>"))).rejects.toThrow(/nicht gefunden/);
    expect(upsert).not.toHaveBeenCalled();
  });
});
