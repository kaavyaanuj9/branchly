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
    "w-full rounded-lg border border-black/10 bg-white/75 px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 transition focus:border-neutral-900 focus:bg-white focus:outline-none";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#f7f7f6] text-neutral-900">
      {googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={setupGoogle} />}
      <BranchField hole={{ rx: 330, ry: 130 }} />

      {/* the wordmark sits dead centre; the profile form hangs below it */}
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: EASE }}
          className="relative"
        >
          <span className="absolute -inset-x-16 -inset-y-10 -z-10 rounded-full bg-[#f7f7f6] blur-2xl" />
          <Wordmark className="block text-[clamp(72px,11vw,148px)] leading-[0.95]" />
          <p className="mt-4 text-[clamp(14px,1.3vw,17px)] text-neutral-500">Facilitate academic collaboration with agents</p>
        </motion.div>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
        onSubmit={(e) => {
          e.preventDefault();
          finish("/api/auth/demo", { email, name, lab });
        }}
        className="absolute left-1/2 top-[calc(50%+clamp(96px,9vw,128px))] z-10 w-[min(300px,calc(100vw-32px))] -translate-x-1/2 space-y-2 rounded-xl border border-black/10 bg-white/60 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl"
      >
        <p className="pb-0.5 text-[12.5px] font-semibold text-neutral-800">Create your profile</p>
        {googleClientId && (
          <>
            <div id="google-button" className="flex min-h-10 justify-center" />
            {demo && (
              <div className="flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-neutral-400">
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-950 py-2 text-[13px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
            Continue
          </button>
        )}
        <p className="text-center text-[10.5px] leading-relaxed text-neutral-400">
          {demo && !googleClientId ? "Demo sign-in, no password. Returning? Use the same Gmail." : "Returning? Use the same Gmail."}
        </p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>}
      </motion.form>
    </main>
  );
}
