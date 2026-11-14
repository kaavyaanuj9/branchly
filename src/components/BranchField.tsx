"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";

// One connected tree of branches growing outward from the very middle of the screen (behind the
// wordmark, the sign-in card, the idea chat), splitting as it goes and graying towards the edges.
// Near the middle the branches are faded out, so they seem to emerge from whatever sits there
// rather than starting in hard ends. Soft gray shade and a frosted, grainy edge frame it; the
// branches drift slightly with the pointer.
//
// Cheap to run: the geometry is computed once per screen size, the growth is a CSS animation on
// plain <path>s, and the fade around the middle is a CSS mask whose size springs when `hole`
// changes (so the branches show closer in when the middle gets smaller).

type Seg = { d: string; w: number; delay: number; dur: number };

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A tree growing outward from the middle: each branch starts where its parent ends and splits. */
function growOutward(w: number, h: number, seed = 11): Seg[] {
  const r = rng(seed);
  const cx = w / 2;
  const cy = h / 2;
  const segs: Seg[] = [];
  const margin = 60;
  const inView = (x: number, y: number) => x > -margin && x < w + margin && y > -margin && y < h + margin;
  const reach = Math.hypot(w / 2, h / 2);

  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number, delay: number) => {
    // lean outward, away from the middle, with a little wander
    const out = Math.atan2(y - cy, x - cx);
    let diff = out - angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const a = angle + diff * 0.25 + (r() - 0.5) * 0.3;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const bend = (r() - 0.5) * len * 0.45;
    const mx = (x + ex) / 2 - Math.sin(a) * bend;
    const my = (y + ey) / 2 + Math.cos(a) * bend;
    const dur = 0.35 + len / 520;
    const f = (v: number) => v.toFixed(1);
    segs.push({ d: `M${f(x)},${f(y)} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}`, w: width, delay, dur });
    if (depth >= 5 || !inView(ex, ey) || len < 18) return;
    const kids = depth === 0 ? 3 : r() < 0.62 ? 2 : 3;
    const spread = 0.42 + r() * 0.3;
    for (let k = 0; k < kids; k++) {
      const off = (k - (kids - 1) / 2) * spread + (r() - 0.5) * 0.25;
      branch(ex, ey, a + off, len * (0.66 + r() * 0.16), Math.max(0.55, width * 0.7), depth + 1, delay + dur * 0.92);
    }
  };

  const N = 16;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.25;
    // start right in the middle; the fade hides the start, so branches emerge from behind the wordmark
    const sx = cx + Math.cos(t) * w * 0.05;
    const sy = cy + Math.sin(t) * h * 0.05;
    const len = (reach / 2.3) * (0.75 + r() * 0.4);
    branch(sx, sy, t, len, 3, 0, 0.1 + r() * 0.3);
  }
  return segs;
}

export function BranchField({
  hole = { rx: 230, ry: 260 },
  fade = 1,
}: {
  /** the middle the branches emerge from behind (half-width, half-height in px) */
  hole?: { rx: number; ry: number };
  /** 1 = full ink; lower values make the branches quieter (behind busier pages) */
  fade?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const segs = useMemo(() => (size ? growOutward(size.w, size.h) : null), [size]);

  // the fade zone around the middle springs to its new size
  const fadeR = (h: { rx: number; ry: number }) => ({ x: h.rx * 1.55, y: Math.max(h.ry * 2.2, h.rx * 0.55) });
  const rx = useSpring(fadeR(hole).x, { stiffness: 60, damping: 18 });
  const ry = useSpring(fadeR(hole).y, { stiffness: 60, damping: 18 });
  useEffect(() => {
    const f = fadeR(hole);
    rx.set(f.x);
    ry.set(f.y);
  }, [hole, rx, ry]);
  const mask = useMotionTemplate`radial-gradient(${rx}px ${ry}px at 50% 50%, transparent 0%, transparent 45%, rgba(0,0,0,0.35) 70%, black 100%)`;

  // a gentle drift with the pointer (the frosted edge stays put, so it reads as depth)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 40, damping: 16 });
  const py = useSpring(my, { stiffness: 40, damping: 16 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * -14);
      my.set((e.clientY / window.innerHeight - 0.5) * -10);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [mx, my]);

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: fade }} aria-hidden>
      <style>{`@keyframes bf-grow { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .bf-path { animation: none !important; stroke-dashoffset: 0 !important; } }`}</style>
      {/* soft gray shade, heavier towards the corners */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(40% 45% at 0% 0%, rgba(140,140,140,0.26), transparent 70%)",
            "radial-gradient(38% 42% at 100% 0%, rgba(140,140,140,0.22), transparent 70%)",
            "radial-gradient(42% 46% at 0% 100%, rgba(140,140,140,0.24), transparent 70%)",
            "radial-gradient(40% 44% at 100% 100%, rgba(140,140,140,0.28), transparent 70%)",
          ].join(","),
        }}
      />
      {size && segs && (
        <motion.div className="absolute -inset-4" style={{ x: px, y: py, WebkitMaskImage: mask, maskImage: mask }}>
          <svg width={size.w + 32} height={size.h + 32} className="absolute inset-0" viewBox={`-16 -16 ${size.w + 32} ${size.h + 32}`}>
            <defs>
              {/* ink: dark where branches emerge from the middle, graying towards the edges */}
              <radialGradient id="bf-ink" gradientUnits="userSpaceOnUse" cx={size.w / 2} cy={size.h / 2} r={Math.hypot(size.w, size.h) * 0.55}>
                <stop offset="0.2" stopColor="#0a0a0a" />
                <stop offset="0.55" stopColor="#3a3a3a" />
                <stop offset="1" stopColor="#b5b5b5" stopOpacity="0.55" />
              </radialGradient>
            </defs>
            <g fill="none" stroke="url(#bf-ink)" strokeLinecap="round">
              {segs.map((s, i) => (
                <path
                  key={i}
                  className="bf-path"
                  d={s.d}
                  strokeWidth={s.w}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1}
                  style={{ animation: `bf-grow ${s.dur.toFixed(2)}s cubic-bezier(0.45,0,0.3,1) ${s.delay.toFixed(2)}s forwards` }}
                />
              ))}
            </g>
          </svg>
        </motion.div>
      )}
      {/* frosted glass towards the edges: blurred, slightly milky, grainy */}
      <div
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{
          WebkitMaskImage: "radial-gradient(ellipse at center, transparent 48%, black 96%)",
          maskImage: "radial-gradient(ellipse at center, transparent 48%, black 96%)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.25)), rgba(240,240,240,0.22)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.55] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

/** The wordmark: lowercase, bold, tight. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-bold tracking-[-0.04em] text-neutral-950 ${className}`}>branchly</span>;
}
