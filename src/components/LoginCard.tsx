"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { GoogleSignInButton } from "@/app/login/GoogleSignInButton";
import { BranchField, Wordmark } from "./BranchField";

// Sign-in: a big centred wordmark and "Start"; then the wordmark shrinks up and the profile card
// rises into the middle. Branches grow out from behind it into a frosted gray edge.
// The card signs in with Google through Firebase (see GoogleSignInButton).

const EASE = [0.22, 1, 0.36, 1] as const;

export function LoginCard({ next }: { next: string }) {
  const [started, setStarted] = useState(false);
  // the branches dissolve around whatever is in the middle: measure it
  const middle = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState({ rx: 420, ry: 140 });
  useEffect(() => {
    const el = middle.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHole({ rx: el.offsetWidth / 2 + 24, ry: el.offsetHeight / 2 + 24 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (started) return;
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && setStarted(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started]);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#f7f7f6] text-neutral-900">
      <BranchField hole={hole} />

      <LayoutGroup>
        <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4">
          <div ref={middle} className="flex flex-col items-center">
          <motion.div layout transition={{ layout: { duration: 0.9, ease: EASE } }} className="relative flex flex-col items-center text-center">
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1, ease: EASE, layout: { duration: 0.9, ease: EASE } }}
            >
              <Wordmark className={`block leading-[0.95] ${started ? "text-[64px]" : "text-[clamp(84px,12vw,168px)]"}`} />
            </motion.div>
            <AnimatePresence>
              {started && (
                <motion.p
                  key="tagline"
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.6, ease: EASE }}
                  className="mt-3 text-[15px] text-neutral-500"
                >
                  Facilitate academic collaboration with agents
                </motion.p>
              )}
            </AnimatePresence>
            {/* Start sits just under the wordmark, out of the flow, and simply fades where it is */}
            <AnimatePresence>
              {!started && (
                <motion.button
                  key="start"
                  onClick={() => setStarted(true)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)", transition: { duration: 0.3 } }}
                  transition={{ delay: 0.9, duration: 0.7, ease: EASE }}
                  className="group absolute left-1/2 top-full mt-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-neutral-950 px-8 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.15)] transition-colors hover:bg-neutral-800"
                >
                  Start
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {started && (
              <motion.div
                key="card"
                layout
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
                className="mt-8 w-[min(360px,calc(100vw-32px))] space-y-4 rounded-2xl border border-black/10 bg-white/55 p-6 text-left shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl"
              >
                <div>
                  <p className="text-[15px] font-semibold">Create your profile</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-neutral-500">
                    Sign in with your Google account. Returning? The same account picks up your teams and trees.
                  </p>
                </div>
                <GoogleSignInButton next={next} />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </LayoutGroup>
    </main>
  );
}
