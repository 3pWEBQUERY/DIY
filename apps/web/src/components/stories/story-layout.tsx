"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  STORY_ELEMENT_COLORS,
  STORY_STAGE_RATIO,
  STORY_TEXT_SHADE,
  STORY_TEXT_SHADE_CSS,
  strokePath,
  type StoryColor,
  type StoryElementView,
  type StoryLayoutView,
  type StoryTextAlign,
  type StoryTextStyle,
} from "@werkraum/shared";
import { cn } from "@/lib/utils";

/**
 * Gestaltete Ebenen einer Story (Text, Sticker, Zeichnungen) – eine Darstellung für Editor, Vorschau,
 * Betrachter, Miniatur und Archiv. Die Bühne muss genau 9:16 sein und `@container` tragen: Positionen
 * stehen in Prozent der Bühne, Grössen in `cqw`, Zeichnungen in einem SVG mit `viewBox` 1 × 16/9 –
 * so sieht eine Story bei jeder Bühnengrösse gleich aus.
 */

/** Grundgrössen in cqw (vor der Skalierung des Elements) */
export const ELEMENT_SIZE = { text: 6, emoji: 13, sticker: 4.6, time: 10, date: 4.6 } as const;

export function elementTransform(e: { x: number; y: number; scale: number; rotation: number }): CSSProperties {
  return {
    position: "absolute",
    left: `${e.x * 100}%`,
    top: `${e.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${e.rotation}deg) scale(${e.scale})`,
  };
}

const color = (c: StoryColor) => STORY_ELEMENT_COLORS[c] ?? STORY_ELEMENT_COLORS.white;

/** Textstil (für Textebenen und den Haupttext der Text-Story) */
export function textStyleCss(style: StoryTextStyle): CSSProperties {
  switch (style) {
    case "normal":
      return { fontWeight: 500 };
    case "caps":
      return { fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" };
    default:
      return { fontWeight: 700, letterSpacing: "-0.02em" };
  }
}

/** Text auf farbiger Fläche, zeilenweise (wie eine Markierung) – Fläche und Schrift aus einem geprüften Farbpaar */
export function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "0.1em 0.38em",
        borderRadius: "0.28em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
}

export const alignClass: Record<StoryTextAlign, string> = { left: "text-left", center: "text-center", right: "text-right" };

function TextElement({ e }: { e: Extract<StoryElementView, { type: "text" }> }) {
  const c = color(e.color);
  // Hintergrund: eigene Fläche (abgedunkelt oder Palettenfarbe) mit frei gewählter Schrift;
  // ältere Ebenen mit Stil „Fläche“ (ohne `bg`): Fläche in der Farbe, Schrift aus dem Farbpaar
  const bg = e.bg === STORY_TEXT_SHADE ? STORY_TEXT_SHADE_CSS : e.bg ? color(e.bg).hex : e.style === "pill" ? c.hex : null;
  const fg = e.bg ? c.hex : e.style === "pill" ? c.fg : c.hex;
  return (
    <p
      className={cn("w-max max-w-[82cqw] whitespace-pre-wrap break-words", alignClass[e.align])}
      style={{ fontSize: `${ELEMENT_SIZE.text}cqw`, lineHeight: bg ? 1.42 : 1.15, color: fg, ...textStyleCss(e.style) }}
    >
      {bg ? <Pill bg={bg} fg={fg}>{e.text}</Pill> : e.text}
    </p>
  );
}

function StickerPill({ c, children }: { c: StoryColor; children: ReactNode }) {
  const p = color(c);
  return (
    <span
      className="inline-flex max-w-[70cqw] items-center gap-[0.3em] whitespace-nowrap rounded-[0.5em] font-extrabold"
      style={{ fontSize: `${ELEMENT_SIZE.sticker}cqw`, lineHeight: 1.1, padding: "0.45em 0.7em", background: p.hex, color: p.fg }}
    >
      {children}
    </span>
  );
}

/** Pfeil als Teil des Stickers (Inhalt, kein Bedienelement) */
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="0.9em" height="0.9em" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

const linkClass = "pointer-events-auto rounded-[0.6em] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white";

export type OverlayLinkHandler = () => void;

export function ElementBody({ e, interactive, onLink }: { e: StoryElementView; interactive: boolean; onLink?: OverlayLinkHandler }) {
  const stop = (ev: React.PointerEvent) => ev.stopPropagation();
  switch (e.type) {
    case "text":
      return <TextElement e={e} />;
    case "emoji":
      return (
        <span className="block select-none" style={{ fontSize: `${ELEMENT_SIZE.emoji}cqw`, lineHeight: 1 }}>
          {e.emoji}
        </span>
      );
    case "time":
      return (
        <span
          className="block whitespace-nowrap num"
          style={{ fontSize: `${e.variant === "time" ? ELEMENT_SIZE.time : ELEMENT_SIZE.date}cqw`, lineHeight: 1, color: color(e.color).hex, ...textStyleCss(e.variant === "date" ? "caps" : "bold") }}
        >
          {e.text}
        </span>
      );
    case "mention": {
      const body = <StickerPill c={e.color}>@{e.handle}</StickerPill>;
      return interactive ? (
        <Link href={`/u/${e.handle}`} className={linkClass} onClick={onLink} onPointerDown={stop} onPointerUp={stop} aria-label={`Profil von @${e.handle}`}>
          {body}
        </Link>
      ) : (
        body
      );
    }
    case "projectLink": {
      const title = e.project?.title ?? "Projekt";
      const body = (
        <StickerPill c={e.color}>
          <Arrow />
          <span className="truncate">{title.length > 40 ? `${title.slice(0, 39)}…` : title}</span>
        </StickerPill>
      );
      return interactive && e.project ? (
        <Link href={e.project.href} className={linkClass} onClick={onLink} onPointerDown={stop} onPointerUp={stop} aria-label={`Projekt: ${title}`}>
          {body}
        </Link>
      ) : (
        body
      );
    }
    case "drawing":
      return null;
  }
}

/** Zeichnung: ein SVG über die ganze Bühne; Verschieben/Drehen/Skalieren um die Bühnenmitte */
export function DrawingLayer({ e, className, pathClassName, ...svg }: { e: Extract<StoryElementView, { type: "drawing" }>; className?: string; pathClassName?: string } & Omit<React.SVGProps<SVGSVGElement>, "className" | "viewBox" | "style">) {
  return (
    <svg
      {...svg}
      viewBox={`0 0 1 ${STORY_STAGE_RATIO}`}
      preserveAspectRatio="none"
      className={cn("absolute inset-0 h-full w-full overflow-visible", className)}
      style={{ transform: `translate(${(e.x - 0.5) * 100}%, ${(e.y - 0.5) * 100}%) rotate(${e.rotation}deg) scale(${e.scale})`, transformOrigin: "50% 50%" }}
      aria-hidden
    >
      {e.strokes.map((s, i) => (
        <path
          key={i}
          d={strokePath(s.points)}
          fill="none"
          stroke={color(s.color).hex}
          strokeWidth={s.width}
          strokeOpacity={s.tool === "marker" ? 0.55 : 1}
          strokeLinecap={s.tool === "marker" ? "square" : "round"}
          strokeLinejoin="round"
          className={pathClassName}
        />
      ))}
    </svg>
  );
}

/**
 * Alle Ebenen einer Story, nach `z` geordnet (Reihenfolge auch für Screenreader). `interactive`:
 * Erwähnungen und Projekt-Sticker sind echte Links (Betrachter), sonst nur Darstellung.
 */
export function StoryOverlay({ layout, interactive = false, onLink, className }: { layout: StoryLayoutView | null | undefined; interactive?: boolean; onLink?: OverlayLinkHandler; className?: string }) {
  if (!layout?.elements.length) return null;
  const elements = [...layout.elements].sort((a, b) => a.z - b.z);
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {elements.map((e) =>
        e.type === "drawing" ? (
          <DrawingLayer key={e.id} e={e} />
        ) : (
          <div key={e.id} style={elementTransform(e)}>
            <ElementBody e={e} interactive={interactive} onLink={onLink} />
          </div>
        ),
      )}
    </div>
  );
}
