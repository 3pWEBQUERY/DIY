import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
const { watchSession } = await import("../session-watch");

/** A-15: offener SSE-Stream endet, sobald die Sitzung nicht mehr gilt. */
describe("watchSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("prüft periodisch und beendet genau einmal, wenn die Sitzung widerrufen wurde", async () => {
    let active = true;
    const check = vi.fn(async () => active);
    const onEnd = vi.fn();
    watchSession(check, onEnd, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    active = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("DB-Fehler beenden den Stream nicht", async () => {
    const onEnd = vi.fn();
    watchSession(async () => Promise.reject(new Error("db down")), onEnd, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("Stopp-Funktion beendet die Prüfung", async () => {
    const check = vi.fn(async () => false);
    const onEnd = vi.fn();
    const stop = watchSession(check, onEnd, 1000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(check).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
