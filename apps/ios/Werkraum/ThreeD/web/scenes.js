/*
 * WERKRAUM – Three.js-Szenen für die iOS-App.
 * Leitmotiv: Ein einziger, durchgehender Faden („Projektfaden“), der sich zu Formen
 * umstrickt. Steuerung aus Swift über window.WR.*, Rückmeldungen via webkit.messageHandlers.wr.
 *
 * Szenen: story · glyph · journal · heat · knot
 */
(function () {
  "use strict";
  const T = window.THREE;
  const post = (m) => { try { window.webkit.messageHandlers.wr.postMessage(m); } catch (_) { /* Vorschau im Browser */ } };
  const N = 900;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ───────────────────────── Formen (je N Punkte, durchgehend) ─────────────────────────

  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function resample(points, n) {
    const seg = []; let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seg.push(d); total += d;
    }
    const out = new Float32Array(n * 3); let k = 0, acc = 0;
    for (let i = 0; i < n; i++) {
      const target = (i / (n - 1)) * total;
      while (k < seg.length - 1 && acc + seg[k] < target) { acc += seg[k]; k++; }
      const f = seg[k] === 0 ? 0 : Math.min(1, (target - acc) / seg[k]);
      const a = points[k], b = points[k + 1];
      out[i * 3] = a[0] + (b[0] - a[0]) * f; out[i * 3 + 1] = a[1] + (b[1] - a[1]) * f; out[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
    }
    return out;
  }

  function fromFn(fn, n = N) {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const p = fn(i / (n - 1)); out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; }
    return out;
  }

  function knaeuel() {
    const ballEnd = 0.93, tail = [1.45, -1.3, 0.3], tilt = 0.42; let last = [0, 0, 0];
    return fromFn((t) => {
      let p;
      if (t <= ballEnd) {
        const u = t / ballEnd;
        const th = 1.2 + 0.6 * Math.sin(u * Math.PI * 2 * 2.3);
        const ph = u * Math.PI * 2 * 1.7;
        const ax = [Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)];
        let v0 = [ax[2], 0, -ax[0]]; const vl = Math.hypot(v0[0], v0[2]) || 1; v0 = [v0[0] / vl, 0, v0[2] / vl];
        const w0 = [ax[1] * v0[2] - ax[2] * v0[1], ax[2] * v0[0] - ax[0] * v0[2], ax[0] * v0[1] - ax[1] * v0[0]];
        const a = u * Math.PI * 2 * 30, r = 1 + 0.03 * Math.sin(u * Math.PI * 2 * 97);
        const x = (Math.cos(a) * v0[0] + Math.sin(a) * w0[0]) * r;
        const y = (Math.cos(a) * v0[1] + Math.sin(a) * w0[1]) * r;
        const z = (Math.cos(a) * v0[2] + Math.sin(a) * w0[2]) * r;
        p = [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]; last = p;
      } else {
        const s = smooth((t - ballEnd) / (1 - ballEnd)); const sag = Math.sin(s * Math.PI) * 0.35;
        p = [last[0] + (tail[0] - last[0]) * s, last[1] + (tail[1] - last[1]) * s - sag, last[2] + (tail[2] - last[2]) * s];
      }
      return p.map((v) => v * 1.0);
    });
  }

  const VASE_Y = [-1.2, -0.75, -0.2, 0.35, 0.82, 1.15], VASE_R = [0.42, 0.8, 0.92, 0.62, 0.3, 0.44];
  function vaseRadius(y) {
    for (let k = 0; k < VASE_Y.length - 1; k++) {
      if (y <= VASE_Y[k + 1]) { const f = (1 - Math.cos(((y - VASE_Y[k]) / (VASE_Y[k + 1] - VASE_Y[k])) * Math.PI)) / 2; return VASE_R[k] + (VASE_R[k + 1] - VASE_R[k]) * f; }
    }
    return VASE_R[VASE_R.length - 1];
  }
  function gefaess() {
    const base = 0.1;
    return fromFn((t) => {
      if (t < base) { const u = t / base, a = u * Math.PI * 12, r = u * VASE_R[0]; return [Math.cos(a) * r * 1.05, VASE_Y[0], Math.sin(a) * r * 1.05]; }
      const u = (t - base) / (1 - base), y = VASE_Y[0] + u * (VASE_Y[5] - VASE_Y[0]);
      const a = u * Math.PI * 2 * 30 + Math.PI * 12, r = vaseRadius(y) * (1 + 0.012 * Math.sin(a * 3));
      return [Math.cos(a) * r * 1.05, y, Math.sin(a) * r * 1.05];
    });
  }

  function hocker() {
    const top = 0.5, under = 0.36, s = 0.72, li = 0.56, lf = 0.74, floor = -1.2, st = -0.58;
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const corner = (sx, sz, y, r) => [sx * r, y, sz * r];
    const legAt = (sx, sz, y) => lerp(corner(sx, sz, under, li), corner(sx, sz, floor, lf), (under - y) / (under - floor));
    const C = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; const pts = [];
    for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, top, s));
    for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, top - 0.03, s * 0.94));
    pts.push(corner(-1, 1, under, s));
    for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, under, s));
    for (let idx = 0; idx < 4; idx++) {
      const [x, z] = C[idx], [nx, nz] = C[(idx + 1) % 4];
      pts.push(corner(x, z, under, li)); pts.push(legAt(x, z, floor)); pts.push(legAt(x, z, st)); pts.push(legAt(nx, nz, st)); pts.push(legAt(nx, nz, under));
    }
    return resample(pts, N);
  }

  function projektfaden(count = 5) {
    const w = 0.045, loopR = 0.17, nodes = [];
    const base = (t) => [-1.75 + t * 3.5, Math.sin(t * Math.PI * 2) * 0.22 - 0.05, Math.cos(t * Math.PI * 2) * 0.12];
    const centers = Array.from({ length: count }, (_, k) => (count === 1 ? 0.5 : 0.1 + (k * 0.8) / (count - 1)));
    for (const c of centers) { const b = base(c); nodes.push([b[0], b[1] + loopR, b[2]]); }
    const points = fromFn((t) => {
      const p = base(t);
      for (const c of centers) {
        const s = (t - c) / w;
        if (s > -1 && s < 1) { const ph = ((s + 1) / 2) * Math.PI * 2; p[0] += Math.sin(ph) * loopR * 0.9; p[1] += (1 - Math.cos(ph)) * loopR; }
      }
      return p;
    });
    return { points, nodes };
  }

  function torusKnot(p = 2, q = 3) {
    return fromFn((t) => { const u = t * Math.PI * 2, r = 0.62 + 0.3 * Math.cos(q * u); return [r * Math.cos(p * u), r * Math.sin(p * u), 0.32 * Math.sin(q * u)]; });
  }
  function stitch3d() {
    return fromFn((t) => { const u = t * Math.PI * 2 * 7; return [-1.5 + t * 3 - 0.14 * Math.sin(u), 0.42 * Math.cos(u), 0.3 * Math.sin(u)]; });
  }
  function grain3d() {
    return fromFn((t) => { const a = t * Math.PI * 2 * 7, r = 0.18 + t * 1.05, w = 1 + 0.12 * Math.sin(a * 3) + 0.05 * Math.sin(a * 0.5); return [Math.cos(a) * r * w, Math.sin(a) * r * w * 0.6, (t - 0.5) * 0.5 + 0.08 * Math.sin(a * 2)]; });
  }
  function frame3d() {
    const pts = []; let s = 1.2, z = -0.3;
    while (s > 0.12) { pts.push([-s, -s * 0.8, z], [s, -s * 0.8, z], [s, s * 0.8, z], [-s + 0.15, s * 0.8, z]); s -= 0.16; z += 0.07; }
    return resample(pts, N);
  }
  function fold3d() {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const x = -1.3 + i * 0.325, z = i % 2 === 0 ? -0.3 : 0.3; pts.push([x, -0.8, z], [x, 0.8, z]); if (i < 8) pts.push([x + 0.325, 0.8, -z]); }
    return resample(pts, N);
  }
  function rose3d() {
    return fromFn((t) => { const th = t * Math.PI * 2, r = 1.1 * Math.cos(3 * th); return [r * Math.cos(th), r * Math.sin(th), 0.25 * Math.sin(6 * th)]; });
  }
  function layers3d() {
    const pts = [];
    for (let i = 0; i < 10; i++) { const y = -1.0 + i * 0.22, w = 1.05 - i * 0.07; pts.push([-w, y, -w * 0.6], [w, y, -w * 0.6], [w, y, w * 0.6], [-w, y, w * 0.6], [-w, y + 0.11, -w * 0.6]); }
    return resample(pts, N);
  }
  function circuit3d(seed) {
    const r = rng(seed || 7); const pts = [[-1.3, -0.9, 0]]; let x = -1.3, y = -0.9, z = 0;
    for (let i = 0; i < 16; i++) { const k = i % 3; if (k === 0) x = clamp(x + 0.25 + r() * 0.35, -1.3, 1.3); else if (k === 1) y = clamp(y + (r() > 0.4 ? 0.4 : -0.3), -1, 1); else z = clamp(z + (r() > 0.5 ? 0.35 : -0.35), -0.6, 0.6); pts.push([x, y, z]); }
    return resample(pts, N);
  }
  function leaf3d() {
    const outline = fromFn((t) => { const a = t * Math.PI * 2; return [0.7 * Math.sin(a) * (1 - 0.3 * Math.cos(a)), -1.15 * Math.cos(a), 0.18 * Math.sin(a * 2)]; }, Math.floor(N * 0.75));
    const pts = []; for (let i = 0; i < outline.length / 3; i++) pts.push([outline[i * 3], outline[i * 3 + 1], outline[i * 3 + 2]]);
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([0.05 * Math.sin(t * 14), -1.15 + t * 2.3, 0]); }
    return resample(pts, N);
  }
  function star3d() {
    return fromFn((t) => { const th = t * Math.PI * 4, r = 0.7 + 0.5 * Math.cos((5 * th) / 2); return [r * Math.sin(th), -r * Math.cos(th), 0.2 * Math.sin(5 * th)]; });
  }
  function kite3d() {
    const pts = [[0, 1.1, 0], [0.6, 0.25, 0.1], [0, -0.45, 0], [-0.6, 0.25, -0.1], [0, 1.1, 0], [0, -0.45, 0]];
    for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push([0.18 * Math.sin(t * Math.PI * 5), -0.45 - t * 0.9, 0.18 * Math.cos(t * Math.PI * 5)]); }
    return resample(pts, N);
  }
  function lissajous3d() {
    return fromFn((t) => { const u = t * Math.PI * 2; return [1.1 * Math.sin(3 * u + Math.PI / 2), 0.95 * Math.sin(2 * u), 0.6 * Math.sin(5 * u)]; });
  }
  function line3d() { return fromFn((t) => [-1.8 + t * 3.6, 0.1 * Math.sin(t * Math.PI * 2), 0]); }

  function glyphShape(glyph, seed) {
    switch (glyph) {
      case "loop": return knaeuel();
      case "vessel": return gefaess();
      case "chair": return hocker();
      case "ring": return torusKnot(2, 3);
      case "stitch": return stitch3d();
      case "grain": return grain3d();
      case "frame": return frame3d();
      case "fold": return fold3d();
      case "brush": return rose3d();
      case "layers": return layers3d();
      case "circuit": return circuit3d(seed);
      case "leaf": return leaf3d();
      case "star": return star3d();
      case "kite": return kite3d();
      case "thread": return projektfaden().points;
      default: return lissajous3d();
    }
  }

  // ───────────────────────── Faden als schattierte Röhre ─────────────────────────

  class Thread {
    constructor(n, radius, radial = 8) {
      this.n = n; this.radius = radius; this.radial = radial;
      const vcount = n * radial;
      this.pos = new Float32Array(vcount * 3); this.nor = new Float32Array(vcount * 3); this.col = new Float32Array(vcount * 3);
      const idx = new Uint32Array((n - 1) * radial * 6); let k = 0;
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute("normal", new T.BufferAttribute(this.nor, 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute("color", new T.BufferAttribute(this.col, 3));
      g.setIndex(new T.BufferAttribute(idx, 1));
      this.geometry = g;
      this.material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02 });
      this.mesh = new T.Mesh(g, this.material);
      this.mesh.frustumCulled = false;
    }
    setColors(a, b) {
      const ca = new T.Color(a), cb = new T.Color(b || a);
      for (let i = 0; i < this.n; i++) {
        const f = Math.pow(i / (this.n - 1), 1.6); const c = ca.clone().lerp(cb, f);
        for (let j = 0; j < this.radial; j++) { const o = (i * this.radial + j) * 3; this.col[o] = c.r; this.col[o + 1] = c.g; this.col[o + 2] = c.b; }
      }
      this.geometry.attributes.color.needsUpdate = true;
    }
    update(P, drawn = 1) {
      const n = this.n, R = this.radial;
      let nx = 0, ny = 1, nz = 0;
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
        let tx = P[i1] - P[i0], ty = P[i1 + 1] - P[i0 + 1], tz = P[i1 + 2] - P[i0 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        if (i === 0) { if (Math.abs(ty) > 0.9) { nx = 1; ny = 0; nz = 0; } }
        const d = nx * tx + ny * ty + nz * tz; nx -= d * tx; ny -= d * ty; nz -= d * tz;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        const u = i / (n - 1);
        const taper = Math.min(1, u * 40, (1 - u) * 40 + 0.15);
        const r = this.radius * taper;
        for (let j = 0; j < R; j++) {
          const a = (j / R) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          const ox = c * nx + s * bx, oy = c * ny + s * by, oz = c * nz + s * bz;
          const o = (i * R + j) * 3;
          this.nor[o] = ox; this.nor[o + 1] = oy; this.nor[o + 2] = oz;
          this.pos[o] = P[i * 3] + ox * r; this.pos[o + 1] = P[i * 3 + 1] + oy * r; this.pos[o + 2] = P[i * 3 + 2] + oz * r;
        }
      }
      this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
      this.geometry.setDrawRange(0, Math.floor(clamp(drawn, 0, 1) * (n - 1)) * R * 6);
    }
  }

  function lerpPts(out, a, b, f) { for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * f; return out; }

  // ───────────────────────── Laufzeit ─────────────────────────

  const WR = (window.WR = {});
  let renderer, scene, camera, group, current, theme = { ink: "#252822", moss: "#3D604C", clay: "#B46C4D", paper: "#FAF9F6", muted: "#73766E", dark: false };
  let paused = false, reduce = false, last = 0, start = 0, booted = false;
  const drag = { active: false, x: 0, y: 0, vx: 0, vy: 0, yaw: 0, pitch: 0, moved: 0, enabled: true };
  let hemi, dir, rim;

  function setup() {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    group = new T.Group(); scene.add(group);
    hemi = new T.HemisphereLight(0xffffff, 0x444444, 1.1); scene.add(hemi);
    dir = new T.DirectionalLight(0xffffff, 1.6); dir.position.set(3, 5, 6); scene.add(dir);
    rim = new T.DirectionalLight(0xffffff, 0.6); rim.position.set(-4, -2, -3); scene.add(rim);
    resize(); window.addEventListener("resize", resize);
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { drag.active = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.vx = drag.vy = 0; });
    window.addEventListener("pointermove", (e) => {
      if (!drag.active || !drag.enabled) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.vx = dx * 0.008; drag.vy = dy * 0.006; drag.yaw += drag.vx; drag.pitch = clamp(drag.pitch + drag.vy, -0.9, 0.9);
      if (paused || reduce) render();
    });
    window.addEventListener("pointerup", (e) => {
      if (drag.active && drag.moved < 8 && current && current.onTap) current.onTap(e.clientX, e.clientY);
      drag.active = false;
    });
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // Szene soll in schmalen und breiten Rahmen gleich gross wirken
    camera.position.z = (current && current.distance ? current.distance : 7.2) * (w / h < 0.8 ? 1.25 : 1);
    camera.updateProjectionMatrix(); render();
  }

  function render() { if (renderer) renderer.render(scene, camera); }

  function loop(now) {
    requestAnimationFrame(loop);
    if (paused || !current) return;
    const t = (now - start) / 1000, dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!drag.active) { drag.vx *= 0.94; drag.vy *= 0.94; drag.yaw += drag.vx; drag.pitch = clamp(drag.pitch + drag.vy, -0.9, 0.9); drag.pitch *= 0.985; }
    current.frame(reduce ? 1000 : t, dt);
    group.rotation.y = (current.spin && !reduce ? t * current.spin : 0) + drag.yaw + (current.baseYaw || 0);
    group.rotation.x = drag.pitch + (current.basePitch || 0);
    render();
  }

  function applyTheme() {
    hemi.color.set(theme.dark ? 0xbfc7bd : 0xffffff); hemi.groundColor.set(theme.dark ? 0x101210 : 0x6b6a62);
    hemi.intensity = theme.dark ? 0.9 : 1.15; dir.intensity = theme.dark ? 1.9 : 1.55;
    if (current && current.theme) current.theme();
    render();
  }

  function clearGroup() { while (group.children.length) { const c = group.children.pop(); c.geometry && c.geometry.dispose(); } }

  // ───────────────────────── Szenen ─────────────────────────

  const SCENES = {};

  /** Story: Knäuel → Gefäss → Hocker → Projektfaden (progress 0…3) */
  SCENES.story = (params) => {
    const shapes = [knaeuel(), gefaess(), hocker(), projektfaden().points];
    const nodesDef = projektfaden().nodes;
    const th = new Thread(N, 0.022, 10); group.add(th.mesh);
    const buf = new Float32Array(N * 3);
    const nodes = nodesDef.map((p) => { const m = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), new T.MeshStandardMaterial({ color: theme.moss, roughness: 0.4 })); m.position.set(p[0], p[1], p[2]); m.scale.setScalar(0); group.add(m); return m; });
    let target = params.progress || 0, shown = target;
    const s = {
      spin: 0.18, distance: 7.0, basePitch: 0.12,
      theme() { th.setColors(theme.ink, theme.clay); nodes.forEach((m, i) => m.material.color.set(i % 2 ? theme.clay : theme.moss)); },
      update(p) { if (p.progress != null) target = clamp(p.progress, 0, 3); },
      frame(t) {
        shown += (target - shown) * 0.08;
        const i = Math.min(2, Math.floor(shown)), f = ease(clamp(shown - i, 0, 1));
        lerpPts(buf, shapes[i], shapes[i + 1], f);
        const grow = reduce ? 1 : clamp(t / 2.4, 0, 1);
        th.update(buf, ease(grow));
        const nodeVis = clamp((shown - 2.6) / 0.4, 0, 1);
        nodes.forEach((m, k) => { const v = clamp(nodeVis * 1.4 - k * 0.08, 0, 1); m.scale.setScalar(v * (1 + 0.08 * Math.sin(t * 2 + k))); });
        this.spin = shown > 2.5 ? 0.05 : 0.18;
      },
    };
    s.theme();
    return s;
  };

  /** Glyph: Faden formt die Glyphe einer Kategorie; wechselt weich beim Update. */
  SCENES.glyph = (params) => {
    const th = new Thread(N, params.thin ? 0.018 : 0.026, 10); group.add(th.mesh);
    let from = line3d(), to = glyphShape(params.glyph, params.seed), t0 = 0, morphing = true, color = params.color || theme.clay;
    const buf = new Float32Array(N * 3); let lastT = 0;
    const s = {
      spin: params.spin != null ? params.spin : 0.22, distance: params.distance || 7.0, basePitch: 0.18,
      theme() { th.setColors(color, theme.ink); },
      update(p) {
        if (p.color) { color = p.color; this.theme(); }
        if (p.glyph !== undefined && (p.glyph !== params.glyph || p.seed !== params.seed)) {
          params.glyph = p.glyph; params.seed = p.seed;
          from = Float32Array.from(buf); to = glyphShape(p.glyph, p.seed); t0 = lastT; morphing = true;
        }
      },
      frame(t) {
        lastT = t;
        const f = morphing ? ease(clamp((t - t0) / 1.3, 0, 1)) : 1;
        if (f >= 1) morphing = false;
        lerpPts(buf, from, to, f);
        th.update(buf, 1);
      },
    };
    s.theme();
    return s;
  };

  /** Journal: der Projektfaden eines Projekts – jeder Eintrag ein Knoten, Nachbauten zweigen ab. */
  SCENES.journal = (params) => {
    const entries = (params.nodes || []).slice(0, 40);
    const count = Math.max(1, entries.length);
    const loopR = 0.16, w = Math.min(0.045, 0.32 / count);
    const span = Math.min(4.2, 2.2 + count * 0.22);
    const base = (t) => [-span / 2 + t * span, Math.sin(t * Math.PI * 2 * 0.9) * 0.28, Math.cos(t * Math.PI * 2 * 0.7) * 0.22];
    const centers = entries.length ? entries.map((_, k) => (count === 1 ? 0.5 : 0.08 + (k * 0.84) / (count - 1))) : [];
    const done = params.status === "COMPLETED";
    const points = fromFn((t) => {
      const p = base(t);
      for (const c of centers) { const s = (t - c) / w; if (s > -1 && s < 1) { const ph = ((s + 1) / 2) * Math.PI * 2; p[0] += Math.sin(ph) * loopR * 0.9; p[1] += (1 - Math.cos(ph)) * loopR; } }
      if (done && t > 0.96) { const u = (t - 0.96) / 0.04 * Math.PI * 2; p[1] += Math.sin(u) * 0.12; p[2] += Math.cos(u) * 0.12 - 0.12; }
      return p;
    });
    const th = new Thread(N, 0.024, 8); group.add(th.mesh);
    const color = params.color || theme.clay;
    const nodeMeshes = centers.map((c, k) => {
      const b = base(c); const kind = entries[k].kind;
      const r = kind === "milestone" ? 0.1 : kind === "problem" ? 0.075 : 0.065;
      const m = new T.Mesh(kind === "problem" ? new T.TorusGeometry(r, 0.022, 12, 32) : new T.SphereGeometry(r, 28, 18), new T.MeshStandardMaterial({ roughness: 0.35 }));
      m.position.set(b[0], b[1] + loopR * 2 + 0.02, b[2]); m.userData = { index: k, kind, r }; m.scale.setScalar(0); group.add(m); return m;
    });
    // Nachbauten: Fäden, die sich vom Ende abzweigen
    const branches = [];
    for (let i = 0; i < Math.min(6, params.remixes || 0); i++) {
      const ang = (i / Math.max(1, params.remixes || 1)) * Math.PI * 1.4 - 0.7;
      const start = base(0.94 - i * 0.05);
      const pts = fromFn((t) => [start[0] + t * 1.1 * Math.cos(ang) + 0.1 * Math.sin(t * 9), start[1] - t * 0.9 * Math.sin(ang + 0.6) - t * 0.3, start[2] + t * 0.9 * Math.sin(ang)], 160);
      const b = new Thread(160, 0.012, 6); b.update(pts, 0); group.add(b.mesh); branches.push({ b, pts, d: 0.5 + i * 0.12 });
    }
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let highlight = params.highlight != null ? params.highlight : -1;
    const s = {
      spin: 0.0, distance: Math.max(4.4, span * 1.5), basePitch: 0.2, baseYaw: -0.35,
      theme() {
        th.setColors(theme.ink, color);
        nodeMeshes.forEach((m) => m.material.color.set(m.userData.kind === "milestone" ? theme.clay : m.userData.kind === "problem" ? "#C29A3E" : theme.moss));
        branches.forEach(({ b }) => b.setColors(theme.muted, theme.moss));
      },
      update(p) { if (p.highlight !== undefined) highlight = p.highlight; },
      onTap(x, y) {
        ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(nodeMeshes, false)[0];
        if (hit) { highlight = hit.object.userData.index; post({ type: "node", index: highlight }); }
      },
      frame(t) {
        const grow = reduce ? 1 : ease(clamp(t / 2.6, 0, 1));
        th.update(points, grow);
        nodeMeshes.forEach((m, k) => {
          const appear = clamp((grow - centers[k]) * 8, 0, 1);
          const hl = k === highlight ? 1.45 + 0.08 * Math.sin(t * 4) : 1;
          m.scale.setScalar(appear * hl);
          if (m.userData.kind === "problem") m.rotation.y = t * 0.8;
        });
        branches.forEach(({ b, pts, d }) => b.update(pts, ease(clamp((t - 2.0 - d) / 1.4, 0, 1))));
        this.baseYaw = -0.35 + Math.sin(t * 0.25) * 0.18;
      },
    };
    s.theme();
    return s;
  };

  /** Heat: Aktivitätslandschaft der letzten 12 Wochen, verbunden durch einen Faden. */
  SCENES.heat = (params) => {
    const days = (params.days || []).slice(-84);
    while (days.length < 84) days.unshift(0);
    const max = Math.max(1, ...days);
    const geo = new T.BoxGeometry(0.2, 1, 0.2);
    const mat = new T.MeshStandardMaterial({ roughness: 0.7 });
    const inst = new T.InstancedMesh(geo, mat, 84); group.add(inst);
    const dummy = new T.Object3D(), c0 = new T.Color(), c1 = new T.Color();
    const cell = (i) => { const wk = Math.floor(i / 7), d = i % 7; return [(wk - 5.5) * 0.27, (d - 3) * 0.27]; };
    const heights = days.map((n) => 0.04 + (n / max) * 0.9);
    const active = days.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    const pathPts = active.length > 1 ? active.map((i) => { const [x, z] = cell(i); return [x, heights[i] + 0.06 - 0.45, z]; }) : [[-1.5, -0.4, 0], [1.5, -0.4, 0]];
    const thread = new Thread(500, 0.014, 6); group.add(thread.mesh);
    const curve = resample(pathPts.length > 1 ? pathPts : [[-1, 0, 0], [1, 0, 0]], 500);
    const s = {
      spin: 0, distance: 6.4, basePitch: 0.62, baseYaw: 0.6,
      theme() { mat.needsUpdate = true; thread.setColors(theme.clay, theme.ink); paint(); },
      frame(t) {
        const g = reduce ? 1 : ease(clamp(t / 1.8, 0, 1));
        for (let i = 0; i < 84; i++) {
          const [x, z] = cell(i); const h = heights[i] * clamp(g * 1.3 - (i % 7) * 0.03, 0.02, 1);
          dummy.position.set(x, h / 2 - 0.45, z); dummy.scale.set(1, h, 1); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
        thread.update(curve, ease(clamp((t - 1.2) / 2, 0, 1)));
        this.baseYaw = 0.6 + Math.sin(t * 0.2) * 0.25;
      },
    };
    function paint() {
      c0.set(theme.dark ? "#2a2d27" : "#E3E4DE"); c1.set(theme.moss);
      for (let i = 0; i < 84; i++) inst.setColorAt(i, c0.clone().lerp(c1, days[i] ? 0.35 + 0.65 * (days[i] / max) : 0));
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    s.theme();
    return s;
  };

  /** Knot: Faden knüpft sich zum Knoten – Feier beim Abschluss. */
  SCENES.knot = (params) => {
    const th = new Thread(N, 0.03, 9); group.add(th.mesh);
    const a = line3d(), b = torusKnot(2, 3), buf = new Float32Array(N * 3);
    const dots = new T.InstancedMesh(new T.SphereGeometry(0.035, 12, 8), new T.MeshStandardMaterial({ roughness: 0.4 }), 60); group.add(dots);
    const dirs = Array.from({ length: 60 }, () => { const u = Math.random() * 2 - 1, p = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); return [r * Math.cos(p), u, r * Math.sin(p), 0.6 + Math.random()]; });
    const dummy = new T.Object3D(); let t0 = 0, lastT = 0;
    const s = {
      spin: 0.35, distance: 6.6,
      theme() { th.setColors(params.color || theme.moss, theme.clay); const c = new T.Color(); for (let i = 0; i < 60; i++) dots.setColorAt(i, c.set(i % 3 === 0 ? theme.clay : i % 3 === 1 ? theme.moss : "#C29A3E")); dots.instanceColor.needsUpdate = true; },
      celebrate() { t0 = lastT; },
      frame(t) {
        lastT = t; const k = t - t0;
        const f = reduce ? 1 : ease(clamp(k / 1.6, 0, 1));
        lerpPts(buf, a, b, f); th.update(buf, 1);
        const burst = clamp((k - 1.3) / 1.4, 0, 1);
        for (let i = 0; i < 60; i++) {
          const d = dirs[i], r = burst * 2.2 * d[3];
          dummy.position.set(d[0] * r, d[1] * r, d[2] * r); dummy.scale.setScalar(burst > 0 && burst < 1 ? 1 - burst * 0.7 : 0); dummy.updateMatrix(); dots.setMatrixAt(i, dummy.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
      },
    };
    s.theme();
    return s;
  };

  // ───────────────────────── Schnittstelle zu Swift ─────────────────────────

  WR.boot = (cfg) => {
    if (!renderer) setup();
    if (cfg.theme) theme = Object.assign(theme, cfg.theme);
    reduce = !!cfg.reduceMotion;
    drag.enabled = cfg.interactive !== false;
    clearGroup(); drag.yaw = 0; drag.pitch = 0;
    const make = SCENES[cfg.scene] || SCENES.glyph;
    current = make(cfg.params || {});
    applyTheme(); resize();
    start = performance.now(); last = start; booted = true;
    render();
    post({ type: "ready", scene: cfg.scene });
  };
  WR.update = (p) => { if (current && current.update) current.update(p || {}); if (paused || reduce) { current && current.frame(1000, 0.016); render(); } };
  WR.theme = (t) => { theme = Object.assign(theme, t || {}); applyTheme(); };
  WR.pause = (p) => { paused = !!p; if (!paused) last = performance.now(); };
  WR.celebrate = () => { if (current && current.celebrate) current.celebrate(); };

  // Vorschau ohne App: index.html#{"scene":"story"}
  if (!window.webkit && location.hash.length > 2) { try { WR.boot(JSON.parse(decodeURIComponent(location.hash.slice(1)))); } catch (_) { /* ignorieren */ } }
  post({ type: "loaded" });
})();
