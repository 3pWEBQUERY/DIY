import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VideoRejected, ffmpegAvailable, probe, transcode } from "../video";

const hasFfmpeg = await ffmpegAvailable();
const dir = mkdtempSync(join(tmpdir(), "vt-"));
const make = (name: string, args: string[]) => {
  const out = join(dir, name);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  return out;
};

describe.skipIf(!hasFfmpeg)("Video-Transkodierung", () => {
  it("wandelt ein iPhone-ähnliches HEVC-Video (60 fps, 2.5K, GPS, gedreht) in ein universelles MP4", async () => {
    const src = make("iphone.mov", [
      "-f", "lavfi", "-i", "testsrc2=size=2560x1440:rate=60:duration=3",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:v", "libx265", "-preset", "ultrafast", "-tag:v", "hvc1", "-c:a", "aac",
      "-metadata", "location=+47.3769+008.5417/", "-metadata", "com.apple.quicktime.location.ISO6709=+47.3769+008.5417/",
    ]);
    // Wie iPhone-Hochformat: Querformat-Pixel + Drehung als Anzeige-Metadaten
    const rotated = make("iphone-rot.mov", ["-display_rotation", "90", "-i", src, "-c", "copy"]);
    expect((await probe(rotated)).height).toBeGreaterThan((await probe(rotated)).width!);
    // Ergebnis nur innerhalb des Callbacks auf der Platte – danach räumt transcode auf
    let tmpPath = "";
    const r = await transcode(rotated, { maxSeconds: 180 }, async (res) => {
      tmpPath = res.videoPath;
      expect(statSync(res.videoPath).size).toBe(res.videoBytes);
      return { ...res, video: readFileSync(res.videoPath) };
    });
    expect(existsSync(tmpPath)).toBe(false);
    const out = join(dir, "out.mp4");
    writeFileSync(out, r.video);
    const info = await probe(out);
    expect(info.codec).toBe("h264");
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1920);
    expect(r.height).toBeGreaterThan(r.width); // Hochformat (Drehung angewendet)
    expect(r.durationMs).toBeGreaterThan(2500);
    expect(info.audio).toBe(true);
    const meta = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags:stream=avg_frame_rate", "-of", "json", out]).toString();
    expect(meta).not.toMatch(/47\.3769|location/i);
    const fps = JSON.parse(meta).streams.find((s: { avg_frame_rate: string }) => s.avg_frame_rate !== "0/0").avg_frame_rate.split("/").map(Number);
    expect(fps[0] / fps[1]).toBeLessThanOrEqual(30.01);
    // „faststart“: moov-Atom vor den Mediendaten
    const head = r.video.subarray(0, 4096).toString("latin1");
    expect(head.indexOf("moov")).toBeGreaterThan(-1);
    expect(r.poster.subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG
  }, 120_000);

  it("lehnt zu lange Videos mit verständlicher Meldung ab", async () => {
    const src = make("long.mp4", ["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=10:duration=6", "-c:v", "libx264", "-preset", "ultrafast"]);
    const use = vi.fn(async () => undefined);
    await expect(transcode(src, { maxSeconds: 3 }, use)).rejects.toThrow(/zu lang \(6 Sek\.\)/);
    await expect(transcode(src, { maxSeconds: 3 }, use)).rejects.toBeInstanceOf(VideoRejected);
    expect(use).not.toHaveBeenCalled();
  }, 60_000);

  it("lehnt Dateien ohne Videospur ab", async () => {
    const txt = join(dir, "text.bin");
    writeFileSync(txt, "kein video, nur text".repeat(100));
    await expect(transcode(txt, { maxSeconds: 180 }, async () => undefined)).rejects.toBeInstanceOf(VideoRejected);
  }, 30_000);
});
