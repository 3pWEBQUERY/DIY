import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { HeicTooLarge, decodeHeic, isHevcHeif } from "../heic";

// Testbilder mit libheif/x265 erzeugt (96×64, links rot, rechts blau; „rotated“ zusätzlich mit irot 90°)
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));

async function toWebp(buf: Buffer) {
  const img = await decodeHeic(buf, 80_000_000);
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } }).webp().toBuffer();
}

describe("HEIC (iPhone-Fotos)", () => {
  it("erkennt HEVC-HEIF, aber nicht AVIF, JPEG oder PNG", async () => {
    expect(isHevcHeif(fixture("sample.heic"))).toBe(true);
    const avif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).avif().toBuffer();
    expect(isHevcHeif(avif)).toBe(false);
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(isHevcHeif(jpeg)).toBe(false);
    expect(isHevcHeif(Buffer.from("kurz"))).toBe(false);
  });

  it("sharp allein kann HEVC-HEIC nicht lesen (Grund für den eigenen Decoder)", async () => {
    await expect(sharp(fixture("sample.heic")).raw().toBuffer()).rejects.toThrow();
  });

  it("dekodiert HEIC in WebP mit korrekten Farben", async () => {
    const webp = await toWebp(fixture("sample.heic"));
    const meta = await sharp(webp).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 96, 64]);
    const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    expect(px(5, 32)[0]).toBeGreaterThan(150); // links rot
    expect(px(90, 32)[2]).toBeGreaterThan(150); // rechts blau
  });

  it("wendet die Drehung aus dem HEIF-Container an", async () => {
    const meta = await sharp(await toWebp(fixture("rotated.heic"))).metadata();
    expect([meta.width, meta.height]).toEqual([64, 96]);
  });

  it("prüft die Pixelgrenze vor dem Dekodieren", async () => {
    await expect(decodeHeic(fixture("sample.heic"), 1000)).rejects.toBeInstanceOf(HeicTooLarge);
  });
});
