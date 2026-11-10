import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
const { chunkPayloads, NOTIFY_MAX_BYTES } = await import("../bus");

const cuid = (i: number) => `c${i.toString(36).padStart(24, "0")}`;

describe("Echtzeit-Nutzlast", () => {
  it("verteilt grosse Fan-outs auf mehrere Nachrichten unter dem pg_notify-Limit", () => {
    const ids = Array.from({ length: 500 }, (_, i) => cuid(i));
    const chunks = chunkPayloads(ids, { t: "counts" });
    expect(chunks.length).toBeGreaterThan(1);
    const seen: string[] = [];
    for (const c of chunks) {
      expect(Buffer.byteLength(c)).toBeLessThanOrEqual(NOTIFY_MAX_BYTES);
      const p = JSON.parse(c) as { u: string[]; e: { t: string } };
      expect(p.e).toEqual({ t: "counts" });
      seen.push(...p.u);
    }
    expect(seen).toEqual(ids);
  });

  it("kleine Empfängerlisten bleiben eine Nachricht", () => {
    expect(chunkPayloads(["a", "b"], { t: "message", c: "x" })).toEqual([JSON.stringify({ u: ["a", "b"], e: { t: "message", c: "x" } })]);
  });

  it("Grenze exakt einhalten", () => {
    const ids = Array.from({ length: 50 }, (_, i) => cuid(i));
    for (const max of [60, 100, 333]) {
      for (const c of chunkPayloads(ids, { t: "counts" }, max)) expect(Buffer.byteLength(c)).toBeLessThanOrEqual(max);
    }
  });
});
