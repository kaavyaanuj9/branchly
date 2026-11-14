"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

// One connected tree of branches growing out from whatever sits in the middle of the screen
// (the sign-in card, the idea chat): every branch starts where its parent ends and splits again,
// dark near the centre and thinning to gray at the tips. Around the edges, soft gray shade and a
// frosted-glass blur. Drawn in screen pixels, on the client only.

type Seg = { d: string; w: number; delay: number; dur: number };

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function growTree(w: number, h: number, hole: { rx: number; ry: number }, seed = 11): Seg[] {
  const r = rng(seed);
  const cx = w / 2;
  const cy = h / 2;
  const segs: Seg[] = [];
  const reach = Math.hypot(w / 2, h / 2);
  const margin = 60;
  const inView = (x: number, y: number) => x > -margin && x < w + margin && y > -margin && y < h + margin;

  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number, delay: number) => {
    // lean outward, away from the centre, so branches never grow back over the card
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
    segs.push({ d: `M${x.toFixed(1)},${y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`, w: width, delay, dur });
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
    // start just under the edge of whatever is in the middle, so branches emerge from behind it
    const sx = cx + Math.cos(t) * hole.rx * 0.9;
    const sy = cy + Math.sin(t) * hole.ry * 0.9;
    const len = Math.max(60, (reach - Math.hypot(hole.rx, hole.ry) * 0.7) / 2.6) * (0.75 + r() * 0.4);
    branch(sx, sy, t, len, 2.8, 0, 0.35 + r() * 0.35);
  }
  return segs;
}

export function BranchField({
  hole = { rx: 230, ry: 260 },
  fade = 1,
}: {
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
  const segs = useMemo(() => {
    if (!size) return null;
    return growTree(size.w, size.h, { rx: Math.min(hole.rx, size.w * 0.4), ry: Math.min(hole.ry, size.h * 0.4) });
  }, [size, hole.rx, hole.ry]);

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: fade }} aria-hidden>
      {/* soft gray shade, heavier towards the corners */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(38% 42% at 0% 0%, rgba(150,150,150,0.30), transparent 70%)",
            "radial-gradient(36% 40% at 100% 0%, rgba(150,150,150,0.26), transparent 70%)",
            "radial-gradient(40% 44% at 0% 100%, rgba(150,150,150,0.28), transparent 70%)",
            "radial-gradient(38% 42% at 100% 100%, rgba(150,150,150,0.32), transparent 70%)",
            "radial-gradient(70% 60% at 50% 50%, transparent 55%, rgba(170,170,170,0.18) 100%)",
          ].join(","),
        }}
      />
      {size && segs && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          <defs>
            {/* ink: near-black at the centre, fading to gray at the tips */}
            <radialGradient id="bf-ink" gradientUnits="userSpaceOnUse" cx={size.w / 2} cy={size.h / 2} r={Math.hypot(size.w, size.h) * 0.5}>
              <stop offset="0.25" stopColor="#0a0a0a" />
              <stop offset="0.6" stopColor="#555" />
              <stop offset="1" stopColor="#bdbdbd" stopOpacity="0.55" />
            </radialGradient>
          </defs>
          {segs.map((s, i) => (
            <motion.path
              key={i}
              d={s.d}
              fill="none"
              stroke="url(#bf-ink)"
              strokeWidth={s.w}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: s.dur, delay: s.delay, ease: "linear" }}
            />
          ))}
        </svg>
      )}
      {/* frosted glass towards the edges: blurred and grainy */}
      <div
        className="absolute inset-0 backdrop-blur-[2.5px]"
        style={{
          WebkitMaskImage: "radial-gradient(ellipse at center, transparent 45%, black 92%)",
          maskImage: "radial-gradient(ellipse at center, transparent 45%, black 92%)",
          background:
            "rgba(240,240,240,0.25) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

/** The wordmark: lowercase, bold, tight. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-bold tracking-[-0.04em] text-neutral-950 ${className}`}>branchly</span>;
}
