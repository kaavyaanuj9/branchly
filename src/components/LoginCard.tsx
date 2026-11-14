"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Loader2, Network } from "lucide-react";

// Sign-in page: "Sign in with Google" when GOOGLE_CLIENT_ID is set, otherwise a Gmail-address
// demo sign-in. Behind it, a slowly drifting constellation stands in for the field.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

// a fixed, pseudo-random constellation (same on server and client)
const STARS = Array.from({ length: 70 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const q = (v: number) => Math.round(v * 100) / 100; // same digits on server and browser
  return { x: q(r(1) * 100), y: q(r(2) * 100), s: q(0.6 + r(3) * 1.8), d: q(r(4) * 6), hue: [243, 172, 38, 330, 262][i % 5] };
});
const LINKS = STARS.flatMap((a, i) =>
  STARS.slice(i + 1)
    .map((b, j) => ({ a: i, b: i + 1 + j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
    .filter((l) => l.d < 13),
);

export function LoginCard({ googleClientId, demo }: { googleClientId: string; demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (path: string, body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      router.replace("/?start=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const setupGoogle = () => {
    const el = document.getElementById("google-button");
    if (!window.google || !el || !googleClientId) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (r) => finish("/api/auth/google", { credential: r.credential }),
    });
    window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320 });
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0b1020] px-4 text-white">
      {googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={setupGoogle} />}

      {/* the field, drifting */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {LINKS.map((l, i) => (
          <motion.line
            key={i}
            x1={STARS[l.a].x}
            y1={STARS[l.a].y}
            x2={STARS[l.b].x}
            y2={STARS[l.b].y}
            stroke="#818cf8"
            strokeWidth={0.06}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.35 }}
            transition={{ duration: 2.4, delay: 0.3 + (i % 30) * 0.05 }}
          />
        ))}
        {STARS.map((s, i) => (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.s * 0.18}
            fill={`hsl(${s.hue} 85% 70%)`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0.35, 0.95, 0.35], scale: 1 }}
            transition={{ opacity: { duration: 4 + s.d, repeat: Infinity, delay: s.d }, scale: { duration: 0.8, delay: i * 0.015 } }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0b1020_75%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[440px] rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/40">
            <Network className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">HypoTree</span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          From a hunch to a hypothesis tree,
          <span className="block bg-gradient-to-r from-indigo-300 via-emerald-300 to-amber-200 bg-clip-text text-transparent">
            checked against the whole field.
          </span>
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
          Describe an idea in your own words. Claude sharpens it into a testable hypothesis, the field map shows who has
          been there, and your team grows it into experiments.
        </p>

        <div className="mt-7 space-y-4">
          {googleClientId && <div id="google-button" className="flex min-h-11 justify-center" />}
          {googleClientId && demo && (
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
          )}
          {demo && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                finish("/api/auth/demo", { email });
              }}
              className="space-y-2"
            >
              <label className="block text-[12px] font-medium text-slate-300">Your Gmail address</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                />
                <button
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 text-[14px] font-semibold shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </button>
              </div>
              {!googleClientId && (
                <p className="text-[11.5px] leading-relaxed text-slate-500">
                  Demo sign-in: no password, for this local demo only. Set GOOGLE_CLIENT_ID for real Google sign-in.
                </p>
              )}
            </form>
          )}
          {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-[13px] text-rose-200">{error}</p>}
        </div>
      </motion.div>
    </main>
  );
}
