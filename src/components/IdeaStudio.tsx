"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Sprout, X } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import type { ChatMessage, TreeNode } from "@/lib/types";
import { getJSON, leavesOf, type FieldItem } from "./FieldMapPanels";
import { toEvidence, type FieldPaper } from "./FieldPanel";

// The idea studio: chat an idea -> Claude sharpens it into a testable hypothesis -> the field
// map zooms to where it lands -> the hypothesis tree grows out of it. One continuous scene:
// the idea card morphs from the chat into the map and then into the tree's root box.

interface Formulation {
  reply: string;
  hypothesis: string;
  problem: string;
  method: string;
  setting: string;
  why: string;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  f?: Formulation;
}
interface Located {
  node: string;
  path: { id: string; label: string }[];
  novelty_level: "crowded" | "related" | "sparse";
  novelty_hint: string;
  directly_relevant?: number | null;
  placement_confidence: number;
  nearest: FieldPaper[];
}
interface Candidate {
  kind: "hypothesis" | "experiment";
  title: string;
  lens: string;
  rationale: string;
  confidence: number;
  goal?: string;
  steps?: string[];
  expectedResult?: string;
}

const EXAMPLES = [
  "AML cells that survive venetoclax lean on GPX4 to avoid ferroptosis",
  "Necroptosis inside tumours makes checkpoint blockade work better",
  "Cancers that depend on mitochondrial respiration are easy to kill by cuproptosis",
];
const PALETTE = ["#818cf8", "#2dd4bf", "#fbbf24", "#f472b6", "#a78bfa", "#38bdf8", "#4ade80", "#fb923c", "#c084fc", "#94a3b8"];
const NOVELTY = {
  crowded: { label: "Crowded", cls: "border-amber-300/40 bg-amber-400/10 text-amber-100", dot: "#fbbf24" },
  related: { label: "Related work", cls: "border-sky-300/40 bg-sky-400/10 text-sky-100", dot: "#38bdf8" },
  sparse: { label: "Open ground", cls: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100", dot: "#34d399" },
};
const EASE = [0.22, 1, 0.36, 1] as const;

/** "Spoeck, S." and "K. Sarosiek" both -> the surname */
const surname = (a?: string) => (!a ? "" : a.includes(",") ? a.split(",")[0] : a.trim().split(/\s+/).slice(-1)[0]);

type Phase = "chat" | "map" | "grow";

export function IdeaStudio({
  user,
  onDone,
  onClose,
}: {
  user: { name: string; email: string };
  onDone: () => void;
  onClose?: () => void;
}) {
  const { dispatch } = useStore();
  const [phase, setPhase] = useState<Phase>("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<FieldItem | null>(null);
  const [located, setLocated] = useState<Located | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candError, setCandError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const latest = [...msgs].reverse().find((m) => m.f)?.f ?? null;
  const first = user.name.split(" ")[0];
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getJSON<FieldItem>("/api/field/tree").then(setTree, () => {});
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  // ── chat: ask Claude to (re)formulate ──
  const send = async (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    const next: Msg[] = [...msgs, { id: newId(), role: "user", content: t }];
    setMsgs(next);
    setDraft("");
    setThinking(true);
    setError(null);
    try {
      const f = await getJSON<Formulation>("/api/formulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({
            role: m.role,
            content: m.f ? `${m.f.reply}\nHypothesis: ${m.f.hypothesis}` : m.content,
          })),
        }),
      });
      setMsgs([...next, { id: newId(), role: "assistant", content: f.reply, f }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  };

  // ── map: locate the hypothesis, and start drafting branches at the same time ──
  const place = () => {
    if (!latest) return;
    setPhase("map");
    setStep(0);
    setLocated(null);
    setCandidates(null);
    setCandError(null);
    getJSON<Located>(`/api/field/locate?q=${encodeURIComponent(latest.hypothesis)}`).then(
      (r) => {
        setLocated(r);
        // the camera: whole field -> branch -> topic -> papers
        setTimeout(() => setStep(1), 600);
        setTimeout(() => setStep(2), 1900);
        setTimeout(() => setStep(3), 3100);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    getJSON<{ candidates: Candidate[] }>("/api/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node: { title: latest.hypothesis, rationale: latest.why } }),
    }).then(
      (r) => setCandidates(r.candidates.slice(0, 4)),
      (e) => setCandError(e instanceof Error ? e.message : String(e)),
    );
  };

  // ── grow: the tree sprouts, then becomes the real project ──
  const finish = useCallback(() => {
    if (!latest || !located) return;
    const home = located.placement_confidence >= 0.35;
    const path = located.path.slice(1).map((p) => p.label).join(" › ");
    const root: TreeNode = {
      id: "root",
      parentId: null,
      kind: "root",
      title: latest.hypothesis,
      status: "untested",
      rationale: `${latest.why} Field map: ${path}. ${located.novelty_hint}`.trim(),
      evidence: located.nearest.slice(0, 3).map(toEvidence),
      fieldTopic: home ? located.node : undefined,
      fieldNoHome: !home,
      fieldNovelty: located.novelty_level,
      fieldRelevant: located.directly_relevant ?? undefined,
      fieldTopicFor: latest.hypothesis,
    };
    const kids: TreeNode[] = (candidates ?? []).map((c) => ({
      id: newId(),
      parentId: "root",
      kind: c.kind === "experiment" ? "experiment" : "hypothesis",
      title: c.title,
      status: c.kind === "experiment" ? "planned" : "untested",
      lens: c.lens,
      rationale: c.rationale,
      confidence: c.confidence,
      goal: c.goal,
      steps: c.steps,
      expectedResult: c.expectedResult,
      evidence: [],
    }));
    const chat: ChatMessage[] = msgs.map((m) => ({
      id: m.id,
      role: m.role === "user" ? "user" : "agent",
      text: m.f ? `${m.f.reply}\n\nHypothesis: ${m.f.hypothesis}${m.f.why ? `\n\n${m.f.why}` : ""}` : m.content,
    }));
    const h = latest.hypothesis;
    dispatch({
      type: "newProject",
      title: h.length > 90 ? h.slice(0, 87) + "…" : h,
      nodes: [root, ...kids],
      chats: { root: chat }, // the studio conversation continues in the main box's chat
    });
    // an alert for new papers on the idea (best effort, after the tree exists)
    getJSON<{ token: string }>("/api/field/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: h, label: h }),
    }).then(
      (r) => dispatch({ type: "updateNode", id: "root", patch: { fieldWatch: r.token } }),
      () => {},
    );
    onDone();
  }, [latest, located, candidates, msgs, dispatch, onDone]);

  const grow = () => {
    setPhase("grow");
    setTimeout(finish, 2600 + (candidates?.length ?? 0) * 250);
  };

  const dark = phase !== "grow";
  return (
    <motion.div
      className="fixed inset-0 z-[100] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, backgroundColor: dark ? "#0b1020" : "#f8fafc" }}
      exit={{ opacity: 0, scale: 1.03, filter: "blur(6px)" }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      {onClose && phase === "chat" && (
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[12.5px] text-slate-300 hover:bg-white/10"
        >
          <X className="size-3.5" /> Back to my projects
        </button>
      )}

      <AnimatePresence mode="popLayout">
        {phase === "chat" && (
          <motion.section
            key="chat"
            exit={{ opacity: 0, x: -60, filter: "blur(6px)" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto flex h-full max-w-[760px] flex-col px-5"
          >
            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto pb-6 pt-16">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <p className="text-[13px] font-medium text-indigo-300">Hi {first}</p>
                <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-tight text-white">
                  What are you wondering about?
                </h1>
                <p className="mt-2 max-w-[560px] text-[14.5px] leading-relaxed text-slate-400">
                  Say it however it comes to you. Claude will shape it into a testable hypothesis, then we&apos;ll see
                  where it sits among everything the field has published.
                </p>
              </motion.div>
              {msgs.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-wrap gap-2 pt-2"
                >
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      onClick={() => send(e)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-[12.5px] text-slate-300 transition hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-white"
                    >
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-indigo-500 px-4 py-2.5 text-[14px] leading-relaxed text-white"
                  >
                    {m.content}
                  </motion.div>
                ) : (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5">
                    <p className="flex items-start gap-2 text-[14px] leading-relaxed text-slate-300">
                      <Sparkles className="mt-1 size-3.5 shrink-0 text-indigo-300" /> {m.content}
                    </p>
                    {m.f && <IdeaCard f={m.f} live={m.f === latest} />}
                  </motion.div>
                ),
              )}
              {thinking && (
                <div className="flex items-center gap-2 text-[13px] text-slate-400">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-indigo-300"
                        animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                  Claude is sharpening your idea…
                </div>
              )}
              {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-[13px] text-rose-200">{error}</p>}
              {latest && !thinking && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={place}
                    className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-indigo-500/50"
                  >
                    See where it sits in the field
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </button>
                  <span className="text-[12.5px] text-slate-500">or reply below to refine it</span>
                </motion.div>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="mb-6 flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2 backdrop-blur focus-within:border-indigo-400/60"
            >
              <textarea
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={msgs.length ? 1 : 2}
                placeholder={msgs.length ? "Refine it: narrow the system, change the mechanism…" : "e.g. I think resistant cells survive by…"}
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-white placeholder:text-slate-500 focus:outline-none"
              />
              <button
                disabled={!draft.trim() || thinking}
                className="flex size-10 items-center justify-center rounded-xl bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-40"
              >
                {thinking ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </button>
            </form>
          </motion.section>
        )}

        {phase === "map" && latest && (
          <motion.section
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="flex h-full"
          >
            <div className="relative min-w-0 flex-[3]">
              <FieldCamera tree={tree} located={located} step={step} />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pointer-events-none absolute left-6 top-6 text-[12px] uppercase tracking-[0.2em] text-slate-500"
              >
                Field map · {tree?.count.toLocaleString() ?? "…"} papers
              </motion.p>
            </div>
            <div className="flex w-[min(460px,42vw)] flex-col gap-4 overflow-y-auto border-l border-white/10 bg-white/[0.03] p-6">
              <button
                onClick={() => setPhase("chat")}
                className="flex w-fit items-center gap-1 text-[12.5px] text-slate-400 hover:text-white"
              >
                <ArrowLeft className="size-3.5" /> Refine the idea
              </button>
              <IdeaCard f={latest} live />
              <PathReveal located={located} step={step} />
              <AnimatePresence>
                {located && step >= 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="space-y-3"
                  >
                    <div className={`rounded-xl border p-3 text-[13px] leading-relaxed ${NOVELTY[located.novelty_level].cls}`}>
                      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider">{NOVELTY[located.novelty_level].label}</p>
                      {located.novelty_hint}
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Closest work</p>
                    {located.nearest.slice(0, 4).map((p, i) => (
                      <motion.a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 * i }}
                        className="block rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-[12.5px] leading-snug text-slate-200 hover:border-white/25"
                      >
                        {p.title}
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {surname(p.authors?.[0])} {p.authors && p.authors.length > 1 ? "et al." : ""} ·{" "}
                          {new Date(p.announced * 1000).getFullYear()}
                        </span>
                      </motion.a>
                    ))}
                    <button
                      onClick={grow}
                      disabled={!candidates && !candError}
                      className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 py-3 text-[14px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition disabled:opacity-70"
                    >
                      {candidates || candError ? (
                        <>
                          <Sprout className="size-4" /> Grow the hypothesis tree
                        </>
                      ) : (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Claude is drafting the first branches…
                        </>
                      )}
                    </button>
                    {candError && (
                      <p className="text-[11.5px] text-slate-500">
                        Claude couldn&apos;t draft branches ({candError.slice(0, 80)}); the tree will start with just your
                        hypothesis.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-[13px] text-rose-200">{error}</p>}
            </div>
          </motion.section>
        )}

        {phase === "grow" && latest && <Grow key="grow" f={latest} candidates={candidates ?? []} located={located} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ── the idea card (shared between chat, map and tree: it morphs) ─────────────

function IdeaCard({ f, live }: { f: Formulation; live: boolean }) {
  const parts = (
    [
      ["problem", f.problem, "text-sky-200 bg-sky-400/10 border-sky-300/20"],
      ["method", f.method, "text-amber-100 bg-amber-400/10 border-amber-300/20"],
      ["setting", f.setting, "text-emerald-100 bg-emerald-400/10 border-emerald-300/20"],
    ] as const
  ).filter(([, v]) => v);
  return (
    <motion.div
      layoutId={live ? "idea-card" : undefined}
      transition={{ duration: 0.8, ease: EASE }}
      className="rounded-2xl border border-indigo-300/25 bg-gradient-to-br from-indigo-500/15 to-emerald-500/10 p-4 shadow-xl shadow-indigo-950/40"
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-indigo-300">Hypothesis</p>
      <p className="mt-1.5 text-[17px] font-medium leading-snug text-white">{f.hypothesis}</p>
      {parts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {parts.map(([k, v, cls]) => (
            <span key={k} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${cls}`}>
              <b className="mr-1 font-semibold uppercase opacity-70">{k}</b>
              {v}
            </span>
          ))}
        </div>
      )}
      {f.why && <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-400">{f.why}</p>}
    </motion.div>
  );
}

function PathReveal({ located, step }: { located: Located | null; step: number }) {
  if (!located)
    return (
      <p className="flex items-center gap-2 text-[13px] text-slate-400">
        <Loader2 className="size-3.5 animate-spin" /> Comparing it with every paper on the map…
      </p>
    );
  const labels = located.path.map((p) => p.label);
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {located.placement_confidence >= 0.35 ? "It lands in" : "Closest fit (no clear home yet)"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
        {labels.map((l, i) => (
          <AnimatePresence key={l}>
            {step >= i && (
              <motion.span
                initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: EASE }}
                className={`flex items-center gap-1.5 ${i === labels.length - 1 ? "font-semibold text-white" : "text-slate-300"}`}
              >
                {i > 0 && <span className="text-slate-600">›</span>}
                {l}
              </motion.span>
            )}
          </AnimatePresence>
        ))}
      </div>
    </div>
  );
}

// ── the field, with a camera that flies to where the idea lands ──────────────

const WORLD = { w: 1000, h: 720, cx: 500, cy: 360 };

function FieldCamera({ tree, located, step }: { tree: FieldItem | null; located: Located | null; step: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!tree?.children) return null;
    const n = tree.children.length;
    const branches = tree.children.map((b, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
      const x = WORLD.cx + 300 * Math.cos(a);
      const y = WORLD.cy + 235 * Math.sin(a);
      const topics = leavesOf(b)
        .filter((t) => t.id !== b.id)
        .map((t, j, all) => {
          const spread = Math.min(1.5, 0.32 * all.length);
          const ta = a + (all.length > 1 ? -spread / 2 + (spread * j) / (all.length - 1) : 0);
          return { ...t, x: x + 95 * Math.cos(ta), y: y + 80 * Math.sin(ta) };
        });
      return { ...b, x, y, a, color: PALETTE[k % PALETTE.length], topics };
    });
    return branches;
  }, [tree]);

  const branchId = located?.path[1]?.id;
  const target = located?.node;
  const tb = layout?.find((b) => b.id === branchId);
  const tt = tb?.topics.find((t) => t.id === target) ?? (tb && tb.id === target ? { x: tb.x, y: tb.y, label: tb.label } : null);

  const s0 = Math.min(size.w / WORLD.w, size.h / WORLD.h) * 0.92;
  const [fx, fy, s] =
    step >= 2 && tt ? [tt.x, tt.y, s0 * (target === branchId ? 1.9 : 2.7)] : step >= 1 && tb ? [tb.x, tb.y, s0 * 1.6] : [WORLD.cx, WORLD.cy, s0];
  const transform = `translate(${size.w / 2}px, ${size.h / 2}px) scale(${s}) translate(${-fx}px, ${-fy}px)`;

  // the closest papers, scattered around the landing spot
  const dots = useMemo(
    () =>
      (located?.nearest ?? []).slice(0, 14).map((p, i) => {
        const a = i * 2.39996;
        const r = 16 + (i % 5) * 7;
        return { id: p.id, dx: r * Math.cos(a), dy: r * Math.sin(a) };
      }),
    [located],
  );
  const nov = located ? NOVELTY[located.novelty_level] : null;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-0 top-0"
        style={{ width: WORLD.w, height: WORLD.h, transform, transformOrigin: "0 0", transition: "transform 1.5s cubic-bezier(0.22,1,0.36,1)" }}
      >
        <svg width={WORLD.w} height={WORLD.h} className="absolute inset-0 overflow-visible">
          {layout?.map((b, k) => (
            <g key={b.id} opacity={step >= 1 && b.id !== branchId ? 0.25 : 1} style={{ transition: "opacity 1s" }}>
              <motion.line
                x1={WORLD.cx}
                y1={WORLD.cy}
                x2={b.x}
                y2={b.y}
                stroke={b.color}
                strokeOpacity={0.35}
                strokeWidth={1.2}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: 0.05 * k }}
              />
              {b.topics.map((t) => (
                <line key={t.id} x1={b.x} y1={b.y} x2={t.x} y2={t.y} stroke={b.color} strokeOpacity={0.25} strokeWidth={0.6} />
              ))}
              {b.topics.map((t) => (
                <circle
                  key={t.id}
                  cx={t.x}
                  cy={t.y}
                  r={2 + Math.sqrt(t.count) * 0.35}
                  fill={b.color}
                  fillOpacity={t.id === target && step >= 2 ? 1 : 0.55}
                />
              ))}
              <motion.circle
                cx={b.x}
                cy={b.y}
                r={7 + Math.sqrt(b.count) * 0.55}
                fill={b.color}
                fillOpacity={0.9}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 + 0.06 * k, ease: EASE }}
                style={{ transformOrigin: `${b.x}px ${b.y}px` }}
              />
            </g>
          ))}
          <circle cx={WORLD.cx} cy={WORLD.cy} r={14} fill="#e2e8f0" fillOpacity={0.9} />
          {/* landing: rings and the closest papers */}
          {tt && step >= 2 && (
            <g>
              {[0, 1].map((i) => (
                <motion.circle
                  key={i}
                  cx={tt.x}
                  cy={tt.y}
                  fill="none"
                  stroke={nov?.dot}
                  strokeWidth={0.8}
                  initial={{ r: 4, opacity: 0.9 }}
                  animate={{ r: 34, opacity: 0 }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: i * 1.1 }}
                />
              ))}
              {step >= 3 &&
                dots.map((d, i) => (
                  <motion.g key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.06 * i }}>
                    <line x1={tt.x} y1={tt.y} x2={tt.x + d.dx} y2={tt.y + d.dy} stroke="#e2e8f0" strokeOpacity={0.25} strokeWidth={0.3} />
                    <circle cx={tt.x + d.dx} cy={tt.y + d.dy} r={1.4} fill="#e2e8f0" fillOpacity={0.85} />
                  </motion.g>
                ))}
              <motion.circle
                cx={tt.x}
                cy={tt.y}
                r={3.2}
                fill="#fff"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.6, 1] }}
                transition={{ duration: 0.7 }}
                style={{ transformOrigin: `${tt.x}px ${tt.y}px`, filter: `drop-shadow(0 0 4px ${nov?.dot})` }}
              />
            </g>
          )}
        </svg>
        {/* labels (HTML so they stay crisp when zoomed) */}
        {layout?.map((b) => (
          <div key={b.id}>
            <div
              className="pointer-events-none absolute w-[150px] -translate-x-1/2 text-center text-[11px] font-semibold leading-tight text-slate-200"
              style={{
                left: b.x,
                top: b.y + 14 + Math.sqrt(b.count) * 0.55,
                opacity: step >= 1 && b.id !== branchId ? 0.25 : 1,
                transition: "opacity 1s",
              }}
            >
              {b.label}
            </div>
            {b.id === branchId &&
              step >= 1 &&
              b.topics.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: t.id === target ? 1 : 0.6 }}
                  className={`pointer-events-none absolute w-[90px] -translate-x-1/2 text-center leading-tight ${
                    t.id === target ? "text-[5.5px] font-bold text-white" : "text-[4.5px] text-slate-300"
                  }`}
                  style={{ left: t.x, top: t.y + 5 }}
                >
                  {t.label}
                </motion.div>
              ))}
          </div>
        ))}
        <div
          className="pointer-events-none absolute w-[100px] -translate-x-1/2 text-center text-[12px] font-bold text-white"
          style={{ left: WORLD.cx, top: WORLD.cy + 18, opacity: step >= 1 ? 0 : 1, transition: "opacity .8s" }}
        >
          {tree?.label}
        </div>
      </div>
      {!tree && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-slate-500">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading the field…
        </div>
      )}
    </div>
  );
}

// ── the tree grows out of the idea ───────────────────────────────────────────

function Grow({ f, candidates, located }: { f: Formulation; candidates: Candidate[]; located: Located | null }) {
  const n = candidates.length;
  const W = Math.max(3, n) * 270;
  const nov = located ? { crowded: "crowded field", related: "related work", sparse: "open ground" }[located.novelty_level] : null;
  return (
    <motion.section
      key="grow"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col items-center justify-center px-6"
    >
      <motion.div
        layoutId="idea-card"
        transition={{ duration: 0.9, ease: EASE }}
        className="relative z-10 w-[min(560px,90vw)] rounded-xl border border-slate-300 bg-slate-100 px-5 py-4 shadow-lg"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Paper hypothesis</p>
        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{f.hypothesis}</p>
        {nov && (
          <span className="mt-2 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-800">
            {nov}
          </span>
        )}
      </motion.div>
      <div className="relative" style={{ width: `min(${W}px, 94vw)`, height: 210 }}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} 210`} preserveAspectRatio="none">
          {candidates.map((c, i) => {
            const x = ((i + 0.5) * W) / n;
            return (
              <motion.path
                key={i}
                d={`M ${W / 2} 0 C ${W / 2} 60, ${x} 40, ${x} 96`}
                fill="none"
                stroke={c.kind === "experiment" ? "#fb7185" : "#818cf8"}
                strokeWidth={2}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, delay: 0.9 + i * 0.25, ease: EASE }}
              />
            );
          })}
        </svg>
        {candidates.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 1.4 + i * 0.25, ease: EASE }}
            className={`absolute top-[96px] w-[240px] -translate-x-1/2 rounded-lg border-[1.5px] bg-white px-3 py-2.5 shadow-sm ${
              c.kind === "experiment" ? "border-rose-400" : "border-indigo-400"
            }`}
            style={{ left: `${((i + 0.5) * 100) / n}%` }}
          >
            <p className={`text-[9px] font-bold uppercase tracking-wider ${c.kind === "experiment" ? "text-rose-600" : "text-indigo-600"}`}>
              {c.kind === "experiment" ? "Experiment" : "Sub-hypothesis"}
              <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400">{c.lens}</span>
            </p>
            <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-slate-700">{c.title}</p>
          </motion.div>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 + n * 0.25 }}
        className="mt-10 flex items-center gap-2 text-[13px] text-slate-500"
      >
        <Loader2 className="size-3.5 animate-spin" /> Opening your hypothesis tree…
      </motion.p>
    </motion.section>
  );
}
