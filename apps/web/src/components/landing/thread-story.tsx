"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThreadDrawing } from "./thread-drawing";
import { N, NODE_COUNT, SHAPE_SPECS, gefaess, hocker, knaeuel, projektfaden } from "./thread-shapes";
import { cn } from "@/lib/utils";

const NODE_LABELS = ["Idee", "Journal", "Anleitung", "Produkt", "Nachbau"];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Scrollytelling mit einem einzigen Three.js-Faden.
 * Der Faden wird beim Scrollen vom Knäuel zum Gefäss, zum Hocker und schliesslich
 * zum Projektfaden „umgestrickt“ – die Kernidee der Plattform als Bewegung.
 * Lazy geladen, pausiert ausserhalb des Viewports, respektiert prefers-reduced-motion.
 */
export function ThreadStory({ chapters, hero }: { chapters: ReactNode[]; hero: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [shape, setShape] = useState(0);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { Line2 } = await import("three/addons/lines/Line2.js");
      const { LineGeometry } = await import("three/addons/lines/LineGeometry.js");
      const { LineMaterial } = await import("three/addons/lines/LineMaterial.js");
      if (disposed || !canvasHost.current || !container.current) return;

      const host = canvasHost.current;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        setFallback(true);
        return;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      camera.position.set(0, 0.15, 7.4);

      const group = new THREE.Group();
      scene.add(group);

      const faden = projektfaden();
      const shapes = [knaeuel(), gefaess(), hocker(), faden.points];
      const current = new Float32Array(shapes[0]!);

      // Faden (Line2 = echte Linienstärke in Pixeln)
      const geometry = new LineGeometry();
      geometry.setPositions(current);
      const material = new LineMaterial({ color: 0x262427, linewidth: 1.35, worldUnits: false, transparent: true });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      group.add(line);
      const segAttr = geometry.getAttribute("instanceStart") as unknown as { data: { array: Float32Array; needsUpdate: boolean } };
      const segArray = segAttr.data.array;

      // Stichmarken in Terrakotta
      const STEP = 34;
      const stitchCount = Math.floor(N / STEP);
      const stitchGeo = new THREE.BufferGeometry();
      const stitchPos = new Float32Array(stitchCount * 3);
      stitchGeo.setAttribute("position", new THREE.BufferAttribute(stitchPos, 3));
      const stitches = new THREE.Points(stitchGeo, new THREE.PointsMaterial({ color: 0xb64b3a, size: 4.2, sizeAttenuation: false, transparent: true }));
      stitches.frustumCulled = false;
      group.add(stitches);

      // Knoten des Projektfadens (Moos)
      const nodeGeo = new THREE.BufferGeometry();
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(faden.nodes.flat()), 3));
      const nodeMat = new THREE.PointsMaterial({ color: 0xb64b3a, size: 11, sizeAttenuation: false, transparent: true, opacity: 0 });
      const nodes = new THREE.Points(nodeGeo, nodeMat);
      nodes.frustumCulled = false;
      group.add(nodes);

      let width = 1;
      let height = 1;
      const resize = () => {
        width = host.clientWidth || 1;
        height = host.clientHeight || 1;
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = `${width}px`;
        renderer.domElement.style.height = `${height}px`;
        camera.aspect = width / height;
        // Hochformat: Kamera zurücksetzen, damit die Form vollständig sichtbar bleibt
        camera.position.z = camera.aspect < 0.9 ? 7.4 / Math.max(camera.aspect, 0.55) : 7.4;
        camera.updateProjectionMatrix();
        material.resolution.set(width, height);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let visible = true;
      const io = new IntersectionObserver((entries) => (visible = entries[0]?.isIntersecting ?? true));
      io.observe(container.current);

      const start = performance.now();
      let last = start;
      let rotY = -0.5;
      let lastShape = -1;
      let raf = 0;
      const v = new THREE.Vector3();

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!visible || document.hidden) {
          last = now;
          return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Scrollfortschritt → Formindex f ∈ [0,3]
        const rect = container.current!.getBoundingClientRect();
        const vh = window.innerHeight;
        const pos = -rect.top / vh;
        let f = clamp(pos - 0.9, 0, 3);
        if (reduced) f = Math.round(f);
        const k = Math.min(2, Math.floor(f));
        const frac = f - k;
        const e = f >= 3 ? 1 : smoothstep(0.18, 0.82, frac);
        const A = shapes[k]!;
        const B = shapes[Math.min(3, k + 1)]!;
        for (let i = 0; i < N; i++) {
          // Welle entlang des Fadens: der Faden wird Masche für Masche umgestrickt
          const local = reduced ? e : easeInOut(clamp(e * 1.55 - (i / N) * 0.55));
          const j = i * 3;
          current[j] = A[j]! + (B[j]! - A[j]!) * local;
          current[j + 1] = A[j + 1]! + (B[j + 1]! - A[j + 1]!) * local;
          current[j + 2] = A[j + 2]! + (B[j + 2]! - A[j + 2]!) * local;
        }
        for (let i = 0; i < N - 1; i++) {
          const o = i * 6;
          const a = i * 3;
          segArray[o] = current[a]!;
          segArray[o + 1] = current[a + 1]!;
          segArray[o + 2] = current[a + 2]!;
          segArray[o + 3] = current[a + 3]!;
          segArray[o + 4] = current[a + 4]!;
          segArray[o + 5] = current[a + 5]!;
        }
        segAttr.data.needsUpdate = true;
        for (let s = 0; s < stitchCount; s++) {
          const a = (s * STEP + 17) * 3;
          stitchPos[s * 3] = current[a]!;
          stitchPos[s * 3 + 1] = current[a + 1]!;
          stitchPos[s * 3 + 2] = current[a + 2]!;
        }
        (stitchGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;

        // Einzeichnen beim Laden
        const draw = reduced ? 1 : easeInOut(clamp((now - start) / 2600));
        geometry.instanceCount = Math.max(1, Math.floor(draw * (N - 1)));
        (stitches.material as InstanceType<typeof THREE.PointsMaterial>).opacity = clamp((now - start - 1400) / 900);

        // Rotation: frei drehend, beim Projektfaden frontal
        const fw = smoothstep(2.25, 3, f);
        pointer.x += (pointer.tx - pointer.x) * 0.05;
        pointer.y += (pointer.ty - pointer.y) * 0.05;
        if (!reduced) rotY += dt * 0.16 * (1 - fw);
        const wrapped = Math.atan2(Math.sin(rotY), Math.cos(rotY));
        group.rotation.y = wrapped * (1 - fw) + pointer.x * 0.25;
        group.rotation.x = (0.18 + pointer.y * 0.12) * (1 - fw) + pointer.y * 0.05 * fw;
        nodeMat.opacity = fw;

        renderer.render(scene, camera);

        // Beschriftungen an den Knoten
        group.updateMatrixWorld();
        for (let n = 0; n < NODE_COUNT; n++) {
          const el = labelRefs.current[n];
          if (!el) continue;
          const p = faden.nodes[n]!;
          v.set(p[0], p[1], p[2]).applyMatrix4(group.matrixWorld).project(camera);
          const x = (v.x * 0.5 + 0.5) * width;
          const y = (-v.y * 0.5 + 0.5) * height;
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.opacity = String(smoothstep(0.6, 1, fw));
        }

        const s = Math.round(f);
        if (s !== lastShape) {
          lastShape = s;
          setShape(s);
        }
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onPointer);
        geometry.dispose();
        material.dispose();
        stitchGeo.dispose();
        nodeGeo.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const spec = SHAPE_SPECS[shape] ?? SHAPE_SPECS[0];

  return (
    <div ref={container} className="relative">
      {/* Sticky Bühne */}
      <div className="pointer-events-none sticky top-0 z-0 h-[58vh] w-full lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[54%]">
        <div className="sticky top-0 h-[58vh] w-full lg:h-dvh">
          <div className="absolute inset-0 grid-paper opacity-60 lg:opacity-100" aria-hidden />
          {/* Masslinien */}
          <div className="absolute inset-x-6 bottom-6 top-20 rounded-[28px] border border-line lg:inset-x-10 lg:bottom-10 lg:top-24" aria-hidden />
          <div ref={canvasHost} className="absolute inset-0" />
          {fallback && (
            <div className="absolute inset-0 grid place-items-center p-10">
              <ThreadDrawing className="w-full max-w-lg text-ink" />
            </div>
          )}
          {NODE_LABELS.map((l, i) => (
            <div
              key={l}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              className="absolute left-0 top-0 opacity-0 will-change-transform"
              aria-hidden
            >
              <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-[calc(100%+18px)] whitespace-nowrap rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink lg:text-[11px]">
                {String(i + 1).padStart(2, "0")} {l}
              </span>
            </div>
          ))}
          {/* Datenblatt der aktuellen Form */}
          <div className="absolute bottom-10 left-10 hidden lg:block lg:bottom-14 lg:left-14" aria-live="polite">
            <p className="spec text-ink">Fig. {String(shape + 1).padStart(2, "0")} — {spec.title}</p>
            <p className="mt-1 flex gap-3 spec">
              {spec.spec.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </p>
          </div>
          <div className="absolute right-10 top-28 hidden flex-col items-end gap-1 lg:flex">
            {SHAPE_SPECS.map((s, i) => (
              <span key={s.title} className={cn("font-mono text-[10px] uppercase tracking-[0.14em] transition-colors", i === shape ? "text-ink" : "text-line-strong")}>
                {String(i + 1).padStart(2, "0")} {s.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Erzählspalte */}
      <div className="relative z-10 lg:w-[46%]">
        <div className="flex min-h-[calc(100dvh-4rem)] items-center">{hero}</div>
        {chapters.map((c, i) => (
          <div key={i} className="flex min-h-dvh items-end pb-8 lg:items-center lg:pb-0">
            <div className="w-full bg-paper lg:bg-transparent">{c}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
