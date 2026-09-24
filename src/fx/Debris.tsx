import { useEffect, useRef } from "react";
import { DEBRIS_FADE_AT_MS, DEBRIS_MS, layoutDebris } from "./debrisLayout";
import { hashString, mulberry32 } from "./beat";

// Physics debris (design round 2, step 6): when the title changes, the PREVIOUS title's letters drop out
// of the card, tumble and pile up, then fade and are destroyed. Decorative and short-lived: the new title
// is always the normal, static, real text; nothing here is readable content (the layer is aria-hidden)
// and it never receives input.
//
// Matter.js (MIT) is loaded lazily on the first spill, so themes/users that never enable this pay nothing
// for it in the main bundle. Each spill creates its own engine and destroys it afterwards; a new spill
// (or unmount) cancels the previous one immediately, so nothing accumulates.

const MORPH_DELAY_MS = 650; // wait for the cassette-swap transition to land, then spill

interface Spill {
  cancel: () => void;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function spill(layer: HTMLElement, previousTitle: string, titleEl: HTMLElement, delayMs: number): Promise<Spill> {
  let cancelled = false;
  let raf = 0;
  let timer = 0;
  let cleanup = () => {};
  const cancel = () => {
    cancelled = true;
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
    cleanup();
  };

  timer = window.setTimeout(async () => {
    if (cancelled || document.hidden) return;
    const mod = await import("matter-js");
    if (cancelled) return;
    const { Engine, Bodies, Body, Composite } = mod.default ?? mod;

    const box = layer.getBoundingClientRect();
    const tr = titleEl.getBoundingClientRect();
    const cs = getComputedStyle(titleEl);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx || box.width === 0) return;
    ctx.font = cs.font;
    const glyphs = layoutDebris(previousTitle, (ch) => ctx.measureText(ch).width, tr.left - box.left, tr.width);
    if (glyphs.length === 0) return;

    const fontSize = parseFloat(cs.fontSize) || 16;
    const h = Math.round(fontSize * 1.05);
    const cy = tr.top - box.top + tr.height / 2;
    const W = box.width;
    const H = box.height;
    const rnd = mulberry32(hashString(previousTitle)); // same title -> same tumble, so it can be tested

    const engine = Engine.create({ gravity: { x: 0, y: 1.4 } });
    const wall = (x: number, y: number, w: number, hh: number) => Bodies.rectangle(x, y, w, hh, { isStatic: true });
    Composite.add(engine.world, [
      wall(W / 2, H - 10 + 30, W * 2, 60), // floor: its top edge sits 10px above the card's bottom
      wall(-30, H / 2, 60, H * 3), // left wall
      wall(W + 30, H / 2, 60, H * 3), // right wall
    ]);

    const parts = glyphs.map((g) => {
      const w = Math.max(6, g.w);
      const body = Bodies.rectangle(g.x + w / 2, cy, w * 0.9, h * 0.8, {
        restitution: 0.4,
        friction: 0.35,
        frictionAir: 0.012,
        density: 0.002,
      });
      Body.setVelocity(body, { x: (rnd() - 0.5) * 7, y: -rnd() * 5 });
      Body.setAngularVelocity(body, (rnd() - 0.5) * 0.28);
      const el = document.createElement("span");
      el.textContent = g.ch;
      const s = el.style;
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.width = `${w}px`;
      s.height = `${h}px`;
      s.font = cs.font;
      s.lineHeight = `${h}px`;
      s.textAlign = "center";
      s.whiteSpace = "pre";
      s.color = "var(--mp-fg, currentColor)";
      s.willChange = "transform";
      s.transition = "opacity 700ms ease";
      layer.appendChild(el);
      return { body, el, w };
    });
    Composite.add(engine.world, parts.map((p) => p.body));

    const paint = () => {
      for (const { body, el, w } of parts) {
        el.style.transform = `translate(${body.position.x - w / 2}px, ${body.position.y - h / 2}px) rotate(${body.angle}rad)`;
      }
    };
    paint();

    cleanup = () => {
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      layer.replaceChildren();
      cleanup = () => {};
    };

    const STEP = 1000 / 60;
    const t0 = performance.now();
    let last = t0;
    let acc = 0;
    let fading = false;
    const tick = (now: number) => {
      if (cancelled) return;
      acc += Math.min(now - last, 50); // never simulate a big jump after a stalled frame
      last = now;
      while (acc >= STEP) {
        Engine.update(engine, STEP);
        acc -= STEP;
      }
      paint();
      const age = now - t0;
      if (!fading && age >= DEBRIS_FADE_AT_MS) {
        fading = true;
        for (const p of parts) p.el.style.opacity = "0";
      }
      if (age >= DEBRIS_MS) {
        cleanup();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }, delayMs);

  return { cancel };
}

/** The `.mp-debris` layer. Mounted whenever the effect is on, so it can remember the previous title. */
export function Debris({ title, enabled }: { title: string; enabled: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previous = useRef(title);
  const active = useRef<Spill | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = title;
    const layer = layerRef.current;
    if (!enabled || !layer || !before || before === title || reducedMotion()) return;
    const titleEl = layer.parentElement?.querySelector<HTMLElement>(".mp-title");
    if (!titleEl) return;
    active.current?.cancel(); // a new track cuts any spill still running
    const morph = layer.closest(".mp-root")?.hasAttribute("data-fx-morph");
    let cancelled = false;
    spill(layer, before, titleEl, morph ? MORPH_DELAY_MS : 0).then((s) => {
      if (cancelled) s.cancel();
      else active.current = s;
    });
    return () => {
      cancelled = true;
    };
  }, [title, enabled]);

  useEffect(() => () => active.current?.cancel(), []);

  return <div className="mp-debris" ref={layerRef} aria-hidden="true" />;
}
