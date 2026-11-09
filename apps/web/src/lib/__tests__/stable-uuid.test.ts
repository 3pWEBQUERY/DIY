import { describe, expect, it } from "vitest";
import { stableUuid } from "../stable-uuid";

describe("stableUuid", () => {
  it("liefert für denselben Schlüssel immer dieselbe gültige UUID", () => {
    const a = stableUuid("cmabc123");
    expect(a).toBe(stableUuid("cmabc123"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("unterscheidet Schlüssel und Namensräume", () => {
    expect(stableUuid("a")).not.toBe(stableUuid("b"));
    expect(stableUuid("a", "media")).not.toBe(stableUuid("a", "fanout"));
  });
});
