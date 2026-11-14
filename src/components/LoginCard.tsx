"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { BranchField, Wordmark } from "./BranchField";

// Sign-in: create a profile in the middle; branches grow out from it into a frosted gray edge.
// "Continue with Google" appears when GOOGLE_CLIENT_ID is set; otherwise a Gmail-address demo
// sign-in (no password, local demo only).

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function LoginCard({ googleClientId, demo }: { googleClientId: string; demo: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lab, setLab] = useState("");
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
      callback: (r) => finish("/api/auth/google", { credential: r.credential, lab }),
    });
    window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 300 });
  };

  const field =
    "w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition focus:border-neutral-900 focus:bg-white focus:outline-none";

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#f7f7f6] px-4 text-neutral-900">
      {googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={setupGoogle} />}
      <BranchField hole={{ rx: 215, ry: 250 }} />

      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative"
        >
          {/* a soft paper-coloured halo so branches pass under the words, not through them */}
          <span className="absolute -inset-x-12 -inset-y-8 -z-10 rounded-full bg-[#f7f7f6] blur-2xl" />
          <Wordmark className="text-[64px] leading-none" />
          <p className="mt-3 text-[15px] text-neutral-500">Facilitate academic collaboration with agents</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          onSubmit={(e) => {
            e.preventDefault();
            finish("/api/auth/demo", { email, name, lab });
          }}
          className="mt-8 w-full space-y-3 rounded-2xl border border-black/10 bg-white/55 p-6 text-left shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl"
        >
          <div>
            <p className="text-[15px] font-semibold">Create your profile</p>
            <p className="text-[12.5px] text-neutral-500">Returning? Use the same Gmail to pick up where you left off.</p>
          </div>
          {googleClientId && (
            <>
              <div id="google-button" className="flex min-h-11 justify-center pt-1" />
              {demo && (
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-neutral-400">
                  <span className="h-px flex-1 bg-black/10" /> or <span className="h-px flex-1 bg-black/10" />
                </div>
              )}
            </>
          )}
          {demo && (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className={field} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                autoComplete="email"
                className={field}
              />
            </>
          )}
          <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Lab or institution (optional)" className={field} />
          {demo && (
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 py-2.5 text-[14px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Create profile
            </button>
          )}
          {demo && !googleClientId && (
            <p className="text-center text-[11px] leading-relaxed text-neutral-400">
              Demo sign-in: no password, for this local demo only. Set GOOGLE_CLIENT_ID for real Google sign-in.
            </p>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
        </motion.form>
      </div>
    </main>
  );
}
