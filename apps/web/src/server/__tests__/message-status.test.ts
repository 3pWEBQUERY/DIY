import { describe, expect, it } from "vitest";
import { messageStatus } from "@/lib/message-status";

const r = (joinedAt: string, deliveredAt: string | null, readAt: string | null) => ({ joinedAt, deliveredAt, readAt });
const T = "2026-11-11T10:00:00.000Z";

describe("Lesebestätigungen (✓ / ✓✓ / ✓✓ blau)", () => {
  it("Einzelchat: gesendet → zugestellt → gelesen", () => {
    expect(messageStatus(T, [r("2026-11-01T00:00:00.000Z", null, null)])).toBe("sent");
    expect(messageStatus(T, [r("2026-11-01T00:00:00.000Z", "2026-11-11T10:00:05.000Z", null)])).toBe("delivered");
    expect(messageStatus(T, [r("2026-11-01T00:00:00.000Z", "2026-11-11T10:00:05.000Z", "2026-11-11T10:01:00.000Z")])).toBe("read");
  });
  it("älterer Lesestand gilt nicht für neue Nachrichten", () => {
    expect(messageStatus(T, [r("2026-11-01T00:00:00.000Z", "2026-11-11T09:00:00.000Z", "2026-11-11T09:00:00.000Z")])).toBe("sent");
  });
  it("Gruppe: blau erst, wenn alle gelesen haben", () => {
    const a = r("2026-11-01T00:00:00.000Z", "2026-11-11T10:00:01.000Z", "2026-11-11T10:00:02.000Z");
    const b = r("2026-11-01T00:00:00.000Z", "2026-11-11T10:00:01.000Z", null);
    expect(messageStatus(T, [a, b])).toBe("delivered");
    expect(messageStatus(T, [a, { ...b, readAt: "2026-11-11T10:05:00.000Z" }])).toBe("read");
  });
  it("Gruppe: wer später beigetreten ist, zählt nicht", () => {
    const a = r("2026-11-01T00:00:00.000Z", "2026-11-11T10:00:01.000Z", "2026-11-11T10:00:02.000Z");
    const late = r("2026-11-11T11:00:00.000Z", null, null);
    expect(messageStatus(T, [a, late])).toBe("read");
  });
  it("ohne Empfänger:innen bleibt es bei einem Häkchen", () => {
    expect(messageStatus(T, [])).toBe("sent");
  });
});
