import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Video-Transkodierung mit ffmpeg (läuft im Worker):
 * - H.264 (High) + AAC in MP4 → spielt in allen Browsern und auf iPhone/Android
 *   (iPhone-Aufnahmen sind oft HEVC/.mov und laufen in Chrome/Firefox nicht)
 * - max. 1920 px an der langen Seite, max. 30 fps, „faststart“ für sofortigen Wiedergabestart
 * - alle Metadaten entfernt (u. a. GPS-Standort aus Handy-Videos)
 * - Vorschaubild aus dem fertigen Video
 */

export class VideoRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoRejected";
  }
}

type ProbeStream = { codec_type?: string; codec_name?: string; width?: number; height?: number; tags?: Record<string, string>; side_data_list?: { rotation?: number }[] };
type Probe = { format?: { duration?: string }; streams?: ProbeStream[] };

function run(cmd: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} nach ${Math.round(timeoutMs / 1000)} s abgebrochen`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} beendet mit Code ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

let available: boolean | null = null;
/** Ist ffmpeg installiert? (lokal evtl. nicht – dann wird das Original durchgereicht) */
export async function ffmpegAvailable() {
  if (available == null) available = await run("ffmpeg", ["-hide_banner", "-version"], 10_000).then(() => true, () => false);
  return available;
}

export async function probe(file: string) {
  const json = JSON.parse(await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 60_000)) as Probe;
  const v = json.streams?.find((s) => s.codec_type === "video");
  const audio = !!json.streams?.some((s) => s.codec_type === "audio");
  const duration = Number(json.format?.duration ?? 0);
  const rotation = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0)) % 180 === 90;
  return { hasVideo: !!v, audio, duration: Number.isFinite(duration) ? duration : 0, codec: v?.codec_name ?? null, width: rotation ? v?.height : v?.width, height: rotation ? v?.width : v?.height };
}

export type TranscodeResult = { video: Buffer; poster: Buffer; width: number; height: number; durationMs: number };

export async function transcode(input: Buffer, opts: { maxSeconds: number; timeoutMs?: number }): Promise<TranscodeResult> {
  const dir = await mkdtemp(join(tmpdir(), "werkuno-video-"));
  const src = join(dir, "in");
  const out = join(dir, "out.mp4");
  const poster = join(dir, "poster.jpg");
  try {
    await writeFile(src, input);
    const info = await probe(src).catch(() => null);
    if (!info?.hasVideo) throw new VideoRejected("Die Datei enthält kein lesbares Video.");
    if (info.duration > opts.maxSeconds + 1) {
      const max = opts.maxSeconds >= 60 ? `${Math.round(opts.maxSeconds / 60)} Min.` : `${opts.maxSeconds} Sek.`;
      throw new VideoRejected(`Das Video ist zu lang (${Math.round(info.duration)} Sek.). Erlaubt sind höchstens ${max}`);
    }
    await run(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", src,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
        "-fpsmax", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "high", "-level", "4.1",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart",
        "-t", String(opts.maxSeconds + 1),
        out,
      ],
      opts.timeoutMs ?? 12 * 60_000,
    );
    // Vorschaubild: kurz nach Beginn (erste Frames sind oft schwarz)
    const at = Math.min(1, Math.max(0, info.duration / 3)).toFixed(2);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", at, "-i", out, "-frames:v", "1", "-q:v", "3", poster], 60_000);
    const final = await probe(out);
    return {
      video: await readFile(out),
      poster: await readFile(poster),
      width: final.width ?? info.width ?? 0,
      height: final.height ?? info.height ?? 0,
      durationMs: Math.round((final.duration || info.duration) * 1000),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
