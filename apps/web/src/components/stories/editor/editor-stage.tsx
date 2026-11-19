"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { STORY_ELEMENT_COLORS, simplifyStroke, strokePath, STORY_STAGE_RATIO, type StoryColor, type StoryElement, type StoryElementView } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { DrawingLayer, ElementBody, elementTransform } from "../story-layout";
import { describeElement, nextElementId, strokesHit, toDrawingLocal, type EditorAction, type EditorState } from "./editor-state";

/**
 * Bühne des Story-Editors (9:16): Elemente antippen und verschieben, mit zwei Fingern skalieren und
 * drehen, mit der Maus über den Griff oder das Mausrad (Umschalt = drehen). Zum Löschen auf den
 * Papierkorb ziehen. Jede Geste ist ein Schritt im Verlauf. Tastatur (WCAG 2.5.7): Element mit Tab
 * oder in der Ebenenliste wählen, dann Pfeile (Umschalt = grosse Schritte), + / −, [ / ], Entf, Bild ↑/↓.
 */

export type DrawTool = { tool: "pen" | "marker" | "eraser"; color: StoryColor; width: number };
export type EditorStageHandle = { focus: () => void };

type Pt = { x: number; y: number };
type Gesture =
  | { kind: "move"; id: string; pointerId: number; start: Pt; origin: Pt; key: string; moved: boolean; wasSelected: boolean }
  | { kind: "pinch"; id: string; a: number; b: number; startDist: number; startAngle: number; startMid: Pt; origin: { x: number; y: number; scale: number; rotation: number }; key: string }
  | { kind: "handle"; id: string; pointerId: number; center: Pt; startDist: number; startAngle: number; origin: { scale: number; rotation: number }; key: string }
  | { kind: "draw"; pointerId: number; points: [number, number][] }
  | { kind: "erase"; pointerId: number };

/** Papierkorb unten in der Mitte (Bühnenkoordinaten) */
const inTrash = (p: Pt) => p.y > 0.86 && Math.abs(p.x - 0.5) < 0.16;
let gestureSeq = 0;

export const EditorStage = forwardRef<
  EditorStageHandle,
  {
    state: EditorState;
    dispatch: (a: EditorAction) => void;
    /** Hintergrund: Foto, Video oder Farbfläche */
    children: ReactNode;
    draw: DrawTool | null;
    projectTitles: ReadonlyMap<string, string>;
    onEditText: (id: string) => void;
    className?: string;
  }
>(function EditorStage({ state, dispatch, children, draw, projectTitles, onEditText, className }, ref) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const drawingId = useRef<string | null>(null);
  const [trash, setTrash] = useState<"off" | "on" | "over">("off");
  const [live, setLive] = useState<[number, number][] | null>(null);
  const helpId = useId();
  const stateRef = useRef(state);
  stateRef.current = state;

  useImperativeHandle(ref, () => ({ focus: () => stageRef.current?.focus({ preventScroll: true }) }), []);

  // Werkzeug geschlossen: das nächste Zeichnen beginnt eine neue Zeichnung (eigene Ebene)
  const drawing = !!draw;
  useEffect(() => {
    if (!drawing) drawingId.current = null;
  }, [drawing]);

  const toStage = useCallback((cx: number, cy: number): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
  }, []);

  const element = (id: string) => stateRef.current.layout.elements.find((e) => e.id === id);

  // ── Zeichnen ──
  function finishStroke(points: [number, number][]) {
    if (!draw || draw.tool === "eraser" || !points.length) return;
    const flat = simplifyStroke(points);
    const existing = drawingId.current ? element(drawingId.current) : null;
    const id = existing?.type === "drawing" ? existing.id : nextElementId(stateRef.current);
    drawingId.current = id;
    const pts = existing?.type === "drawing" ? toLocalPoints(flat, existing) : flat;
    dispatch({ type: "addStroke", drawingId: id, stroke: { tool: draw.tool, color: draw.color, width: draw.width, points: pts } });
  }
  function erase(p: Pt) {
    const hits = strokesHit(stateRef.current.layout, p);
    if (hits.length) dispatch({ type: "removeStrokes", hits });
  }

  // ── Zeiger ──
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = toStage(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Zeiger nicht (mehr) aktiv – Bewegungen kommen trotzdem über die Bühne an
    }

    if (draw) {
      if (gesture.current) return; // zweiter Finger beim Zeichnen: ignorieren
      if (draw.tool === "eraser") {
        gesture.current = { kind: "erase", pointerId: e.pointerId };
        erase(p);
      } else {
        gesture.current = { kind: "draw", pointerId: e.pointerId, points: [[p.x, p.y]] };
        setLive([[p.x, p.y]]);
      }
      return;
    }

    const g = gesture.current;
    // Zweiter Finger: Skalieren und Drehen des gewählten Elements
    if (g && (g.kind === "move" || g.kind === "handle") && pointers.current.size === 2) {
      const el = element(g.id);
      if (!el) return;
      const [a, b] = [...pointers.current.keys()] as [number, number];
      const pa = pointers.current.get(a)!;
      const pb = pointers.current.get(b)!;
      gesture.current = {
        kind: "pinch",
        id: g.id,
        a,
        b,
        startDist: dist(pa, pb),
        startAngle: angle(pa, pb),
        startMid: mid(pa, pb),
        origin: { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation },
        key: g.key,
      };
      setTrash("off");
      return;
    }
    if (g) return;

    const target = e.target as Element;
    const handle = target.closest("[data-handle]");
    const id = (target.closest("[data-el]") as HTMLElement | SVGElement | null)?.dataset.el ?? null;
    const key = `g${++gestureSeq}`;
    if (handle && state.selected) {
      const el = element(state.selected);
      const node = stageRef.current?.querySelector<HTMLElement>(`[data-el="${state.selected}"]`);
      if (!el || !node) return;
      const r = node.getBoundingClientRect();
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const cp = { x: e.clientX, y: e.clientY };
      gesture.current = { kind: "handle", id: el.id, pointerId: e.pointerId, center, startDist: dist(center, cp, 1), startAngle: angle(center, cp, 1), origin: { scale: el.scale, rotation: el.rotation }, key };
      e.preventDefault();
      return;
    }
    if (id) {
      const el = element(id);
      if (!el) return;
      const wasSelected = state.selected === id;
      if (!wasSelected) dispatch({ type: "select", id });
      gesture.current = { kind: "move", id, pointerId: e.pointerId, start: p, origin: { x: el.x, y: el.y }, key, moved: false, wasSelected };
      return;
    }
    if (state.selected) dispatch({ type: "select", id: null });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toStage(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    switch (g.kind) {
      case "draw":
        if (e.pointerId !== g.pointerId) return;
        g.points.push([p.x, p.y]);
        setLive([...g.points]);
        return;
      case "erase":
        if (e.pointerId === g.pointerId) erase(p);
        return;
      case "move": {
        if (e.pointerId !== g.pointerId) return;
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy * STORY_STAGE_RATIO) < 0.01) return;
        g.moved = true;
        setTrash(inTrash(p) ? "over" : "on");
        dispatch({ type: "update", id: g.id, patch: { x: g.origin.x + dx, y: g.origin.y + dy }, coalesce: g.key });
        return;
      }
      case "pinch": {
        const pa = pointers.current.get(g.a);
        const pb = pointers.current.get(g.b);
        if (!pa || !pb) return;
        const m = mid(pa, pb);
        dispatch({
          type: "update",
          id: g.id,
          patch: {
            scale: g.origin.scale * (dist(pa, pb) / (g.startDist || 1)),
            rotation: g.origin.rotation + (angle(pa, pb) - g.startAngle),
            x: g.origin.x + (m.x - g.startMid.x),
            y: g.origin.y + (m.y - g.startMid.y),
          },
          coalesce: g.key,
        });
        return;
      }
      case "handle": {
        if (e.pointerId !== g.pointerId) return;
        const cp = { x: e.clientX, y: e.clientY };
        dispatch({ type: "update", id: g.id, patch: { scale: g.origin.scale * (dist(g.center, cp, 1) / (g.startDist || 1)), rotation: g.origin.rotation + (angle(g.center, cp, 1) - g.startAngle) }, coalesce: g.key });
        return;
      }
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const p = pointers.current.get(e.pointerId) ?? toStage(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "draw") {
      if (e.pointerId !== g.pointerId) return;
      gesture.current = null;
      setLive(null);
      if (!cancelled) finishStroke(g.points);
      return;
    }
    if (g.kind === "erase") {
      if (e.pointerId === g.pointerId) gesture.current = null;
      return;
    }
    if (g.kind === "pinch") {
      // Ein Finger bleibt liegen: als Verschieben weiterführen
      const rest = g.a === e.pointerId ? g.b : g.a;
      const rp = pointers.current.get(rest);
      const el = element(g.id);
      if (rp && el && !cancelled) {
        gesture.current = { kind: "move", id: g.id, pointerId: rest, start: rp, origin: { x: el.x, y: el.y }, key: g.key, moved: true, wasSelected: true };
        return;
      }
      gesture.current = null;
      dispatch({ type: "endCoalesce" });
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    gesture.current = null;
    setTrash("off");
    if (g.kind === "move") {
      if (!cancelled && g.moved && inTrash(p)) {
        dispatch({ type: "remove", id: g.id });
        stageRef.current?.focus({ preventScroll: true });
        return;
      }
      // Antippen eines schon gewählten Texts: bearbeiten
      if (!g.moved && g.wasSelected && element(g.id)?.type === "text") onEditText(g.id);
    }
    dispatch({ type: "endCoalesce" });
  }

  // Mausrad: skalieren (Umschalt: drehen) – nativ, damit die Seite dabei nicht scrollt
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const key = { current: "" };
    const onWheel = (ev: WheelEvent) => {
      const s = stateRef.current;
      if (draw || !s.selected) return;
      const el = s.layout.elements.find((x) => x.id === s.selected);
      if (!el) return;
      ev.preventDefault();
      if (!idle) key.current = `w${++gestureSeq}`;
      else clearTimeout(idle);
      idle = setTimeout(() => {
        idle = null;
        dispatch({ type: "endCoalesce" });
      }, 400);
      const d = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      if (ev.shiftKey) dispatch({ type: "update", id: el.id, patch: { rotation: el.rotation + d * 0.2 }, coalesce: key.current });
      else dispatch({ type: "update", id: el.id, patch: { scale: el.scale * Math.exp(-d * 0.0015) }, coalesce: key.current });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      if (idle) clearTimeout(idle);
    };
  }, [draw, dispatch]);

  // ── Tastatur ──
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const id = state.selected;
    if (!id) return;
    const el = element(id);
    if (!el) return;
    const big = e.shiftKey;
    const step = big ? 0.05 : 0.01;
    const k = (what: string) => `k-${what}-${id}`;
    const act = (a: EditorAction) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch(a);
    };
    switch (e.key) {
      case "ArrowLeft":
        return act({ type: "update", id, patch: { x: el.x - step }, coalesce: k("move") });
      case "ArrowRight":
        return act({ type: "update", id, patch: { x: el.x + step }, coalesce: k("move") });
      case "ArrowUp":
        return act({ type: "update", id, patch: { y: el.y - step }, coalesce: k("move") });
      case "ArrowDown":
        return act({ type: "update", id, patch: { y: el.y + step }, coalesce: k("move") });
      case "+":
      case "=":
        return act({ type: "update", id, patch: { scale: el.scale * (big ? 1.25 : 1.1) }, coalesce: k("scale") });
      case "-":
      case "_":
        return act({ type: "update", id, patch: { scale: el.scale / (big ? 1.25 : 1.1) }, coalesce: k("scale") });
      case "[":
        return act({ type: "update", id, patch: { rotation: el.rotation - (big ? 15 : 5) }, coalesce: k("rotate") });
      case "]":
        return act({ type: "update", id, patch: { rotation: el.rotation + (big ? 15 : 5) }, coalesce: k("rotate") });
      case "PageUp":
        return act({ type: "reorder", id, to: "forward" });
      case "PageDown":
        return act({ type: "reorder", id, to: "backward" });
      case "Delete":
      case "Backspace":
        act({ type: "remove", id });
        stageRef.current?.focus({ preventScroll: true });
        return;
      case "Enter":
      case "F2":
        if (el.type === "text" && e.target !== stageRef.current) {
          e.preventDefault();
          onEditText(id);
        }
        return;
      case "Escape":
        // Erst die Auswahl aufheben – der Dialog schliesst beim zweiten Esc
        return act({ type: "select", id: null });
    }
  }

  const elements = [...state.layout.elements].sort((a, b) => a.z - b.z);
  const view = (e: StoryElement): StoryElementView =>
    e.type === "projectLink" ? { ...e, project: { title: projectTitles.get(e.projectId) ?? "Projekt", href: "" } } : e.type === "text" && !e.text.trim() ? { ...e, text: "Dein Text" } : e;

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label="Story-Bühne"
      aria-describedby={helpId}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerEnd(e)}
      onPointerCancel={(e) => onPointerEnd(e, true)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("@container relative aspect-[9/16] w-full touch-none select-none overflow-hidden rounded-2xl border border-line bg-sunken outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", draw && (draw.tool === "eraser" ? "cursor-cell" : "cursor-crosshair"), className)}
    >
      <div className="pointer-events-none absolute inset-0">{children}</div>

      {elements.map((e) => {
        const selected = state.selected === e.id;
        if (e.type === "drawing") {
          return (
            <DrawingLayer
              key={e.id}
              e={e}
              data-el={e.id}
              className={cn("pointer-events-none", selected && !draw && "outline-dashed outline-2 -outline-offset-4 outline-white/80")}
              // Nur die Striche selbst sind antippbar (nicht die leere Fläche dazwischen)
              pathClassName={draw ? undefined : "[pointer-events:visibleStroke] cursor-move"}
            />
          );
        }
        const empty = e.type === "text" && !e.text.trim();
        return (
          <div
            key={e.id}
            data-el={e.id}
            role="button"
            tabIndex={draw ? -1 : 0}
            aria-pressed={selected}
            aria-label={`${describeElement(e)}${selected ? " – ausgewählt" : ""}`}
            onFocus={() => !selected && !draw && dispatch({ type: "select", id: e.id })}
            onDoubleClick={() => e.type === "text" && onEditText(e.id)}
            style={{ ...elementTransform(e), outlineWidth: selected ? `${2 / e.scale}px` : undefined, outlineOffset: `${6 / e.scale}px` }}
            className={cn("cursor-move rounded-[4px] outline-none", draw && "pointer-events-none", selected ? "outline-dashed outline-white" : "focus-visible:outline-dashed focus-visible:outline-white", empty && "opacity-60")}
          >
            {/* Zweite Kontur in Dunkel: Auswahl auch auf hellem Grund sichtbar */}
            {selected && <span aria-hidden className="pointer-events-none absolute border border-dashed border-black/60" style={{ inset: `${-4 / e.scale}px`, borderWidth: `${1 / e.scale}px`, borderRadius: 4 / e.scale }} />}
            <ElementBody e={view(e)} interactive={false} />
            {selected && !draw && (
              <span
                data-handle
                aria-hidden
                title="Ziehen: Grösse und Drehung"
                className="absolute -bottom-3 -right-3 grid size-6 cursor-nwse-resize place-items-center rounded-full border-2 border-white bg-ink"
                style={{ transform: `scale(${1 / e.scale})` }}
              />
            )}
          </div>
        );
      })}

      {/* Strich, der gerade gezeichnet wird */}
      {live && draw && draw.tool !== "eraser" && (
        <svg viewBox={`0 0 1 ${STORY_STAGE_RATIO}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <path
            d={strokePath(live.length === 1 ? [...live[0]!, ...live[0]!] : live.flat())}
            fill="none"
            stroke={STORY_ELEMENT_COLORS[draw.color].hex}
            strokeWidth={draw.width}
            strokeOpacity={draw.tool === "marker" ? 0.55 : 1}
            strokeLinecap={draw.tool === "marker" ? "square" : "round"}
            strokeLinejoin="round"
          />
        </svg>
      )}

      {trash !== "off" && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[3%] grid place-items-center">
          <span className={cn("grid size-12 place-items-center rounded-full border-2 text-white transition-colors motion-reduce:transition-none", trash === "over" ? "border-white bg-danger" : "border-white/70 bg-black/55")}>
            <Trash2 size={20} />
          </span>
        </div>
      )}

      <p id={helpId} className="sr-only">
        Element mit Tab oder in der Ebenenliste wählen. Pfeiltasten verschieben (mit Umschalt in grossen Schritten), Plus und Minus ändern die Grösse, eckige Klammern drehen, Bild auf und Bild ab ändern die Ebene, Entfernen löscht, Eingabe bearbeitet einen Text, Escape hebt die Auswahl auf.
      </p>
    </div>
  );
});

function toLocalPoints(flat: number[], e: { x: number; y: number; scale: number; rotation: number }) {
  const out: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const l = toDrawingLocal({ x: flat[i]!, y: flat[i + 1]! }, e);
    out.push(Math.round(Math.min(1, Math.max(0, l.x)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, l.y)) * 1000) / 1000);
  }
  return out;
}

/** Abstand und Winkel: Bühnenpunkte (0–1) im Seitenverhältnis 9:16 rechnen, damit Drehen nicht verzerrt; Bildschirmpunkte mit `R = 1` */
function dist(a: Pt, b: Pt, R = STORY_STAGE_RATIO) {
  return Math.hypot(b.x - a.x, (b.y - a.y) * R);
}
function angle(a: Pt, b: Pt, R = STORY_STAGE_RATIO) {
  return (Math.atan2((b.y - a.y) * R, b.x - a.x) * 180) / Math.PI;
}
function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
