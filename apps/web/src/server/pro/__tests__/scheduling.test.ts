import { describe, expect, it, vi } from "vitest";
import { projectUpsertSchema, publishAtSchema, tutorialSaveSchema } from "@werkraum/shared";

const isPro = vi.fn();
vi.mock("@/server/pro/service", () => ({ isPro: (...a: unknown[]) => isPro(...a), PRO_NAME: "Creator Pro" }));
const { requireProScheduling } = await import("../scheduling");

describe("Geplante Veröffentlichung (Creator Pro)", () => {
  it("prüft den Zeitpunkt: frühestens in 5 Minuten, höchstens in einem Jahr", () => {
    const now = Date.now();
    expect(publishAtSchema.safeParse(null).success).toBe(true);
    expect(publishAtSchema.safeParse(undefined).success).toBe(true);
    expect(publishAtSchema.safeParse(new Date(now + 60 * 60_000).toISOString()).success).toBe(true);
    expect(publishAtSchema.safeParse(new Date(now + 60_000).toISOString()).success).toBe(false);
    expect(publishAtSchema.safeParse(new Date(now - 60 * 60_000).toISOString()).success).toBe(false);
    expect(publishAtSchema.safeParse(new Date(now + 400 * 86_400_000).toISOString()).success).toBe(false);
    expect(publishAtSchema.safeParse("kein Datum").success).toBe(false);
  });

  it("nimmt den Termin in Projekte und Anleitungen auf", () => {
    const at = new Date(Date.now() + 2 * 3600_000).toISOString();
    const p = projectUpsertSchema.parse({ title: "Hocker aus Eiche", category: "holz", publishAt: at });
    expect(p.publishAt?.toISOString()).toBe(at);
    expect(projectUpsertSchema.parse({ title: "Hocker aus Eiche", category: "holz" }).publishAt).toBeUndefined();
    const t = tutorialSaveSchema.parse({ title: "Hocker bauen", category: "holz", steps: [{ title: "Zuschnitt" }], publishAt: at });
    expect(t.publishAt?.toISOString()).toBe(at);
    const bad = tutorialSaveSchema.safeParse({ title: "Hocker bauen", category: "holz", steps: [{ title: "Zuschnitt" }], publishAt: new Date().toISOString() });
    expect(bad.success).toBe(false);
  });

  it("ist Teil von Creator Pro", async () => {
    isPro.mockResolvedValueOnce(false);
    await expect(requireProScheduling("u1")).rejects.toThrow(/Creator Pro/);
    isPro.mockResolvedValueOnce(true);
    await expect(requireProScheduling("u1")).resolves.toBeUndefined();
  });
});
