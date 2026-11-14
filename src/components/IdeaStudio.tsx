"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, FlaskConical, Loader2, Route, Sparkles, Sprout, X } from "lucide-react";
import { newId } from "@/lib/store";
import type { ChatMessage, TreeNode } from "@/lib/types";
import { BranchField } from "./BranchField";
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

const EXAMPLES = [
  "AML cells that survive venetoclax lean on GPX4 to avoid ferroptosis",
  "Necroptosis inside tumours makes checkpoint blockade work better",
  "Cancers that depend on mitochondrial respiration are easy to kill by cuproptosis",
];
const PALETTE = ["#737373", "#8a8a8a", "#636363", "#9a9a9a", "#525252", "#7d7d7d", "#a3a3a3", "#5c5c5c", "#8f8f8f", "#6b6b6b"];
const NOVELTY = {
  crowded: { label: "Crowded", cls: "border-amber-200 bg-amber-50 text-amber-900", dot: "#d97706" },
  related: { label: "Related work", cls: "border-sky-200 bg-sky-50 text-sky-900", dot: "#0284c7" },
  sparse: { label: "Open ground", cls: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "#059669" },
};
const EASE = [0.22, 1, 0.36, 1] as const;

/** The same paper can come from the field map and from Semantic Scholar; keep it once. */
function dedupeEvidence(list: TreeNode["evidence"]) {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = (e.url || e.text).toLowerCase().slice(0, 120);
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** "Spoeck, S." and "K. Sarosiek" both -> the surname */
const surname = (a?: string) => (!a ? "" : a.includes(",") ? a.split(",")[0] : a.trim().split(/\s+/).slice(-1)[0]);

type Phase = "chat" | "map" | "grow";

export function IdeaStudio({
  user,
  onCreate,
  onClose,
}: {
  user: { name: string; email: string };
  /** Save the new tree (title, nodes, the studio chat on the main box) and open it. */
  onCreate: (tree: { title: string; nodes: TreeNode[]; chats: Record<string, ChatMessage[]> }) => Promise<void>;
  onClose?: () => void;
}) {
  // an alert for new papers on the idea, started while the tree grows
  const watchRef = useRef<Promise<string | undefined> | null>(null);
  const [phase, setPhase] = useState<Phase>("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<FieldItem | null>(null);
  const [located, setLocated] = useState<Located | null>(null);
  // the full tree drafted while the map plays: sub-hypotheses, experiments, papers
  const [generated, setGenerated] = useState<TreeNode[] | null>(null);
  const candidates = generated ? generated.filter((n) => n.parentId === "root") : null;
  const [candError, setCandError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const latest = [...msgs].reverse().find((m) => m.f)?.f ?? null;
  const lastUserText = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const versions = msgs.filter((m) => m.f).length;
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
    setGenerated(null);
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
    getJSON<{ nodes: TreeNode[] }>("/api/trees/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: latest.hypothesis }),
    }).then(
      (r) => setGenerated(r.nodes),
      (e) => setCandError(e instanceof Error ? e.message : String(e)),
    );
  };

  // ── grow: the tree sprouts, then becomes the real project ──
  const finish = useCallback(async () => {
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
      // closest papers on the field map, plus the foundational ones Semantic Scholar found
      evidence: dedupeEvidence([
        ...located.nearest.slice(0, 3).map(toEvidence),
        ...(generated?.find((n) => n.id === "root")?.evidence ?? []),
      ]).slice(0, 6),
      fieldTopic: home ? located.node : undefined,
      fieldNoHome: !home,
      fieldNovelty: located.novelty_level,
      fieldRelevant: located.directly_relevant ?? undefined,
      fieldTopicFor: latest.hypothesis,
    };
    // sub-hypotheses and their experiments, with fresh ids so they never clash
    const ids = new Map<string, string>([["root", "root"]]);
    const rest = (generated ?? []).filter((n) => n.id !== "root");
    rest.forEach((n) => ids.set(n.id, newId()));
    const kids: TreeNode[] = rest.map((n) => ({ ...n, id: ids.get(n.id)!, parentId: ids.get(n.parentId ?? "root") ?? "root" }));
    const chat: ChatMessage[] = msgs.map((m) => ({
      id: m.id,
      role: m.role === "user" ? "user" : "agent",
      text: m.f ? `${m.f.reply}\n\nHypothesis: ${m.f.hypothesis}${m.f.why ? `\n\n${m.f.why}` : ""}` : m.content,
    }));
    const h = latest.hypothesis;
    // the alert is best effort: wait at most a few seconds for it
    const token = await Promise.race([
      watchRef.current ?? Promise.resolve(undefined),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000)),
    ]);
    try {
      await onCreate({
        title: h.length > 90 ? h.slice(0, 87) + "…" : h,
        nodes: [token ? { ...root, fieldWatch: token } : root, ...kids],
        chats: { root: chat }, // the studio conversation continues in the main box's chat
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("map");
    }
  }, [latest, located, generated, msgs, onCreate]);

  const grow = () => {
    setPhase("grow");
    if (latest)
      watchRef.current = getJSON<{ token: string }>("/api/field/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: latest.hypothesis, label: latest.hypothesis }),
      }).then(
        (r) => r.token,
        () => undefined,
      );
    setTimeout(finish, 2600 + (candidates?.length ?? 0) * 250);
  };

  const dark = phase !== "grow";
  return (
    <motion.div
      className="fixed inset-0 z-[100] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, backgroundColor: dark ? "#f7f7f6" : "#f6f6f4" }}
      exit={{ opacity: 0, scale: 1.03, filter: "blur(6px)" }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      {onClose && phase === "chat" && (
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-[12.5px] text-neutral-600 backdrop-blur hover:border-neutral-900"
        >
          <X className="size-3.5" /> Back to my projects
        </button>
      )}

      <AnimatePresence>
        {phase === "chat" && (
          <motion.div key="branches" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <BranchField hole={{ rx: 340, ry: 230 }} fade={0.9} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="popLayout">
        {phase === "chat" && (
          <motion.section
            key="chat"
            exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
            transition={{ duration: 0.6, ease: EASE }}
            ref={scroller}
            className="relative flex h-full flex-col items-center overflow-y-auto px-5"
          >
            {/* one centred column: the question, then your idea as a card you keep refining */}
            <div className="relative my-auto w-full max-w-[600px] space-y-5 py-16">
              <span className="pointer-events-none absolute -inset-x-24 -inset-y-6 -z-10 rounded-[50%] bg-[#f7f7f6]/90 blur-3xl" />
              {!latest && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: EASE }}
                  className="text-center"
                >
                  <p className="text-[13px] text-neutral-500">Hi {first}</p>
                  <h1 className="mt-1.5 text-[clamp(26px,3vw,36px)] font-semibold leading-tight tracking-[-0.02em] text-neutral-950">
                    What are you wondering about?
                  </h1>
                  <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-relaxed text-neutral-500">
                    Put it in your own words. It becomes a testable hypothesis, placed among everything the field has published.
                  </p>
                </motion.div>
              )}

              {latest && (
                <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  {lastUserText && <p className="text-center text-[13px] italic text-neutral-500">“{lastUserText}”</p>}
                  <IdeaCard f={latest} live version={versions} />
                  {!thinking && (
                    <p className="flex items-start justify-center gap-1.5 px-2 text-center text-[12.5px] leading-relaxed text-neutral-500">
                      <Sparkles className="mt-0.5 size-3 shrink-0 text-neutral-400" /> {latest.reply}
                    </p>
                  )}
                </motion.div>
              )}

              {thinking && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-neutral-500">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-neutral-400"
                        animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                  {latest ? "Revising the hypothesis…" : "Shaping it into a testable hypothesis…"}
                </div>
              )}
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-[13px] text-rose-700">{error}</p>}

              {latest && !thinking && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
                  <button
                    onClick={place}
                    className="group flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-neutral-700"
                  >
                    See where it sits in the field
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </button>
                </motion.div>
              )}

              <motion.form
                layout
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
                className={`flex items-end gap-2 rounded-2xl border bg-white/90 shadow-[0_10px_40px_rgba(0,0,0,0.07)] backdrop-blur transition focus-within:border-neutral-900 ${
                  latest ? "border-black/10 p-1.5" : "border-black/15 p-2.5"
                }`}
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
                  rows={latest ? 1 : 3}
                  placeholder={latest ? "Refine it: narrow the system, change the mechanism…" : "e.g. I think AML cells that survive venetoclax switch to…"}
                  className={`flex-1 resize-none bg-transparent px-2.5 py-2 text-neutral-900 placeholder:text-neutral-400 focus:outline-none ${
                    latest ? "min-h-9 text-[13.5px]" : "min-h-20 text-[15.5px]"
                  }`}
                />
                <button
                  disabled={!draft.trim() || thinking}
                  className={`flex items-center justify-center rounded-xl bg-neutral-900 text-white transition hover:bg-neutral-700 disabled:opacity-25 ${
                    latest ? "size-9" : "size-11"
                  }`}
                  title={latest ? "Refine" : "Shape my idea"}
                >
                  {thinking ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </button>
              </motion.form>

              {!latest && !thinking && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-wrap justify-center gap-2"
                >
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      onClick={() => send(e)}
                      className="rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[12.5px] text-neutral-600 backdrop-blur transition hover:border-neutral-900 hover:text-neutral-950"
                    >
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
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
                className="pointer-events-none absolute left-6 top-6 text-[12px] uppercase tracking-[0.2em] text-neutral-400"
              >
                Field map · {tree?.count.toLocaleString() ?? "…"} papers
              </motion.p>
            </div>
            <div className="flex w-[min(460px,42vw)] flex-col gap-4 overflow-y-auto border-l border-black/10 bg-white/70 p-6 backdrop-blur">
              <button
                onClick={() => setPhase("chat")}
                className="flex w-fit items-center gap-1 text-[12.5px] text-neutral-500 hover:text-neutral-900"
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Closest work</p>
                    {located.nearest.slice(0, 4).map((p, i) => (
                      <motion.a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 * i }}
                        className="block rounded-lg border border-black/10 bg-white p-2.5 text-[12.5px] leading-snug text-neutral-800 hover:border-neutral-900"
                      >
                        {p.title}
                        <span className="mt-0.5 block text-[11px] text-neutral-500">
                          {surname(p.authors?.[0])} {p.authors && p.authors.length > 1 ? "et al." : ""} ·{" "}
                          {new Date(p.announced * 1000).getFullYear()}
                        </span>
                      </motion.a>
                    ))}
                    <button
                      onClick={grow}
                      disabled={!candidates && !candError}
                      className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-[14px] font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-neutral-700 disabled:opacity-70"
                    >
                      {candidates || candError ? (
                        <>
                          <Sprout className="size-4" /> Grow the hypothesis tree
                        </>
                      ) : (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Drafting sub-hypotheses, experiments and papers…
                        </>
                      )}
                    </button>
                    {candError && (
                      <p className="text-[11.5px] text-neutral-500">
                        The tree couldn&apos;t be drafted ({candError.slice(0, 80)}); it will start with just your
                        hypothesis.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
            </div>
          </motion.section>
        )}

        {phase === "grow" && latest && (
          <Grow key="grow" f={latest} candidates={candidates ?? []} all={generated ?? []} located={located} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── the idea card (shared between chat, map and tree: it morphs) ─────────────

function IdeaCard({ f, live, version }: { f: Formulation; live: boolean; version?: number }) {
  const parts = (
    [
      ["problem", f.problem, "text-neutral-700 bg-neutral-100 border-black/5"],
      ["method", f.method, "text-neutral-700 bg-neutral-100 border-black/5"],
      ["setting", f.setting, "text-neutral-700 bg-neutral-100 border-black/5"],
    ] as const
  ).filter(([, v]) => v);
  return (
    <motion.div
      layoutId={live ? "idea-card" : undefined}
      transition={{ duration: 0.8, ease: EASE }}
      className="rounded-2xl border border-black/10 bg-white/85 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <p className="flex justify-between text-[10.5px] font-bold uppercase tracking-[0.18em] text-neutral-400">
        Hypothesis
        {version && version > 1 && <span className="font-medium normal-case tracking-normal">version {version}</span>}
      </p>
      <p className="mt-1.5 text-[17px] font-semibold leading-snug text-neutral-950">{f.hypothesis}</p>
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
      {f.why && <p className="mt-2.5 text-[12.5px] leading-relaxed text-neutral-500">{f.why}</p>}
    </motion.div>
  );
}

function PathReveal({ located, step }: { located: Located | null; step: number }) {
  if (!located)
    return (
      <p className="flex items-center gap-2 text-[13px] text-neutral-500">
        <Loader2 className="size-3.5 animate-spin" /> Comparing it with every paper on the map…
      </p>
    );
  const labels = located.path.map((p) => p.label);
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
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
                className={`flex items-center gap-1.5 ${i === labels.length - 1 ? "font-semibold text-neutral-950" : "text-neutral-500"}`}
              >
                {i > 0 && <span className="text-neutral-300">›</span>}
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
                fill={b.id === branchId && step >= 1 ? "#111" : b.color}
                fillOpacity={0.9}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 + 0.06 * k, ease: EASE }}
                style={{ transformOrigin: `${b.x}px ${b.y}px` }}
              />
            </g>
          ))}
          <circle cx={WORLD.cx} cy={WORLD.cy} r={14} fill="#111" />
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
                    <line x1={tt.x} y1={tt.y} x2={tt.x + d.dx} y2={tt.y + d.dy} stroke="#404040" strokeOpacity={0.35} strokeWidth={0.3} />
                    <circle cx={tt.x + d.dx} cy={tt.y + d.dy} r={1.4} fill="#404040" fillOpacity={0.9} />
                  </motion.g>
                ))}
              <motion.circle
                cx={tt.x}
                cy={tt.y}
                r={3.2}
                fill="#111"
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
              className="pointer-events-none absolute w-[150px] -translate-x-1/2 text-center text-[11px] font-semibold leading-tight text-neutral-700"
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
                    t.id === target ? "text-[5.5px] font-bold text-neutral-950" : "text-[4.5px] text-neutral-500"
                  }`}
                  style={{ left: t.x, top: t.y + 5 }}
                >
                  {t.label}
                </motion.div>
              ))}
          </div>
        ))}
        <div
          className="pointer-events-none absolute w-[100px] -translate-x-1/2 text-center text-[12px] font-bold text-neutral-950"
          style={{ left: WORLD.cx, top: WORLD.cy + 18, opacity: step >= 1 ? 0 : 1, transition: "opacity .8s" }}
        >
          {tree?.label}
        </div>
      </div>
      {!tree && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-neutral-500">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading the field…
        </div>
      )}
    </div>
  );
}

// ── the tree grows out of the idea, left to right like the tree it becomes ───

function Grow({ f, candidates, all, located }: { f: Formulation; candidates: TreeNode[]; all: TreeNode[]; located: Located | null }) {
  const n = candidates.length;
  const ROW = 118;
  const H = Math.max(240, n * ROW);
  const nov = located ? { crowded: "crowded field", related: "related work", sparse: "open ground" }[located.novelty_level] : null;
  return (
    <motion.section key="grow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex items-center">
        <motion.div
          layoutId="idea-card"
          transition={{ duration: 0.9, ease: EASE }}
          className="relative z-10 w-[min(300px,34vw)] rounded-xl border border-neutral-300 bg-neutral-200/80 px-4 py-4"
        >
          <p className="text-[11px] font-medium text-neutral-500">Paper hypothesis</p>
          <p className="mt-1.5 text-[14.5px] font-semibold leading-[1.45] text-neutral-900">{f.hypothesis}</p>
          {nov && <p className="mt-2 text-[11px] text-neutral-400">{nov}</p>}
        </motion.div>
        {n > 0 && (
          <>
            <svg width={90} height={H} className="shrink-0 overflow-visible">
              {candidates.map((c, i) => {
                const y = i * ROW + ROW / 2 + (H - n * ROW) / 2;
                return (
                  <motion.path
                    key={i}
                    d={`M 0 ${H / 2} C 50 ${H / 2}, 40 ${y}, 90 ${y}`}
                    fill="none"
                    stroke="#a3a3a3"
                    strokeWidth={1.4 + (c.confidence ?? 0.5) * 2.6}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.9 + i * 0.22, ease: EASE }}
                  />
                );
              })}
            </svg>
            <div className="flex flex-col justify-center" style={{ height: H }}>
              {candidates.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.55, delay: 1.25 + i * 0.22, ease: EASE }}
                  className={`my-[9px] w-[min(240px,30vw)] rounded-[10px] border px-3 py-2.5 ${
                    c.kind === "experiment" ? "border-neutral-300 bg-neutral-50" : "border-neutral-300 bg-white"
                  }`}
                  style={{ minHeight: ROW - 18 }}
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600">
                    {c.kind === "experiment" ? <FlaskConical className="size-3.5" /> : <Route className="size-3.5" />}
                    {c.kind === "experiment" ? "Experiment" : "Hypothesis"}
                    <span className="ml-auto truncate text-neutral-400">{c.lens}</span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-neutral-800">{c.title}</p>
                  {c.kind !== "experiment" && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-500">
                      <b className="font-semibold text-neutral-800">{Math.round((c.confidence ?? 0.5) * 100)}%</b> ·{" "}
                      {c.evidence.length} paper{c.evidence.length === 1 ? "" : "s"}
                      {all.some((e) => e.parentId === c.id) && (
                        <span className="ml-auto flex items-center gap-0.5 text-neutral-400">
                          <FlaskConical className="size-3" /> {all.filter((e) => e.parentId === c.id).length}
                        </span>
                      )}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 + n * 0.22 }}
        className="mt-10 flex items-center gap-2 text-[13px] text-neutral-500"
      >
        <Loader2 className="size-3.5 animate-spin" /> Opening your hypothesis tree…
      </motion.p>
    </motion.section>
  );
}
