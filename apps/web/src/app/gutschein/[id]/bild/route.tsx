import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { publicCoupon } from "@/server/commerce/promotions";

/**
 * Teilen-Bild eines Gutscheins (1080 × 1080, für Instagram, Facebook, WhatsApp …): Werkuno-Vorlage
 * „Gutschein einlösen“, im leeren Eingabefeld steht der Code, darunter Rabatt und Shop.
 * Vorlage und Schrift liegen in assets/gutschein (Vorlage im Format 1254 × 1254).
 */

export const runtime = "nodejs";

const SIZE = 1080;
const S = SIZE / 1254; // Koordinaten der Vorlage → Ausgabe

let assets: Promise<{ bg: string; bold: Buffer; semi: Buffer }> | null = null;
function loadAssets() {
  const dir = path.join(process.cwd(), "assets", "gutschein");
  assets ??= Promise.all([readFile(path.join(dir, "vorlage.jpg")), readFile(path.join(dir, "Manrope-Bold.ttf")), readFile(path.join(dir, "Manrope-SemiBold.ttf"))]).then(([bg, bold, semi]) => ({
    bg: `data:image/jpeg;base64,${bg.toString("base64")}`,
    bold,
    semi,
  }));
  return assets;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await publicCoupon(id);
  if (!c?.valid || !c.code) return new Response("Nicht gefunden", { status: 404 });
  const { bg, bold, semi } = await loadAssets();
  // Code füllt das Feld (Breite ~590 px der Vorlage) – lange Codes werden kleiner
  const fieldW = 580 * S;
  const fontSize = Math.round(Math.min(58 * S, fieldW / (c.code.length * 0.7)));
  const info = [c.headline, `bei ${c.shop.name}`].join(" ");

  return new ImageResponse(
    (
      <div style={{ width: SIZE, height: SIZE, display: "flex", position: "relative", fontFamily: "Manrope" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} width={SIZE} height={SIZE} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div
          style={{
            position: "absolute",
            left: 422 * S,
            top: 736 * S,
            width: fieldW,
            height: 76 * S,
            display: "flex",
            alignItems: "center",
            fontSize,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#262427",
          }}
        >
          {c.code}
        </div>
        <div style={{ position: "absolute", left: 0, top: 1018 * S, width: SIZE, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: `${14 * S}px ${34 * S}px`,
              borderRadius: 999,
              background: "rgba(255, 250, 244, 0.94)",
              color: "#262427",
            }}
          >
            <div style={{ display: "flex", fontSize: 34 * S, fontWeight: 700 }}>{info}</div>
            <div style={{ display: "flex", fontSize: 24 * S, fontWeight: 600, color: "#6B6467", marginTop: 2 }}>
              {[c.minLabel, c.endsAt ? `gültig bis ${c.endsAt.toLocaleDateString("de-CH", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Zurich" })}` : null, "werkuno.ch"].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      fonts: [
        { name: "Manrope", data: bold, weight: 700, style: "normal" },
        { name: "Manrope", data: semi, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}
