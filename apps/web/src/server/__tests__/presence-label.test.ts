import { describe, expect, it } from "vitest";
import { presenceLabel } from "@/lib/presence";

const now = Date.parse("2026-11-11T14:00:00.000Z"); // 15:00 in Zürich

describe("Online-Status – Anzeige", () => {
  it("online und zuletzt online", () => {
    expect(presenceLabel({ online: true, lastOnlineAt: null }, now)).toBe("Online");
    expect(presenceLabel({ online: false, lastOnlineAt: "2026-11-11T13:55:00.000Z" }, now)).toBe("Zuletzt online vor 5 Min.");
    expect(presenceLabel({ online: false, lastOnlineAt: "2026-11-11T09:30:00.000Z" }, now)).toBe("Zuletzt online heute um 10:30");
    expect(presenceLabel({ online: false, lastOnlineAt: "2026-11-10T18:15:00.000Z" }, now)).toBe("Zuletzt online gestern um 19:15");
    expect(presenceLabel({ online: false, lastOnlineAt: "2026-11-02T10:00:00.000Z" }, now)).toBe("Zuletzt online am 2. November");
  });
  it("verborgen bzw. unbekannt → nichts anzeigen", () => {
    expect(presenceLabel(null, now)).toBeNull();
    expect(presenceLabel({ online: false, lastOnlineAt: null }, now)).toBeNull();
  });
});
