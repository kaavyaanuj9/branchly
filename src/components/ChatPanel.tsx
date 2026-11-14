"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, FlaskConical, GitBranch, Send } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { childrenOf, findNode, shorten } from "@/lib/tree";
import type { ChatMessage, TreeNode } from "@/lib/types";
import { getAgentReply } from "@/lib/mockAgent";

// An AI assistant dedicated to the selected box (DG3), docked under its details.
// Each box keeps its own chat history.

/** The chat with this box's own agent, docked at the bottom of the side panel. */
export function ChatDock({ node }: { node: TreeNode }) {
  const { state, dispatch, canEdit } = useStore();
  const [draft, setDraft] = useState("");
  const [typingFor, setTypingFor] = useState<string | null>(null);
  // past conversation stays folded until asked for (or until you ask something)
  const [showThread, setShowThread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = state.chats[node.id] ?? [];
  const typing = typingFor === node.id;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing, node.id]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || typingFor) return;
    const nodeId = node.id;
    dispatch({
      type: "addMessage",
      nodeId,
      message: { id: newId(), role: "user", text: question },
    });
    setDraft("");
    setShowThread(true);
    setTypingFor(nodeId);

    try {
      const reply = await getAgentReply(
        question,
        node,
        {
          parent: findNode(state.nodes, node.parentId),
          children: childrenOf(state.nodes, node.id),
        },
        messages,
      );
      dispatch({
        type: "addMessage",
        nodeId,
        message: { id: newId(), role: "agent", ...reply },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "addMessage",
        nodeId,
        message: {
          id: newId(),
          role: "agent",
          text: `⚠️ **Claude API Error**:\n${errorMsg}\n\nEnsure \`ANTHROPIC_API_KEY\` is set in your \`.env.local\` file and restart the server.`,
        },
      });
    } finally {
      setTypingFor(null);
    }
  }

  function acceptProposal(m: ChatMessage) {
    if (!m.proposal) return;
    const p = m.proposal;
    dispatch({
      type: "addNode",
      select: false,
      node: {
        id: newId(),
        parentId: node.id,
        kind: p.kind,
        status: p.kind === "experiment" ? "planned" : "untested",
        title: p.title,
        rationale: p.rationale,
        goal: p.goal,
        steps: p.steps,
        expectedResult: p.expectedResult,
        confidence: 0.6,
        evidence: [],
      },
    });
    dispatch({
      type: "updateMessage",
      nodeId: node.id,
      messageId: m.id,
      patch: { proposalAccepted: true },
    });
  }

  const prompts =
    node.kind === "experiment"
      ? ["What could confound this?", "What result would change our mind?"]
      : ["What evidence supports this?", "What would disprove it?"];
  const noun = node.kind === "experiment" ? "experiment" : node.kind === "root" ? "paper hypothesis" : "hypothesis";

  return (
    <div className="flex max-h-[60%] shrink-0 flex-col border-t border-neutral-200 bg-white">
      {messages.length > 0 && (
        <button
          onClick={() => setShowThread(!showThread)}
          className="flex items-center justify-between px-5 pt-3 text-[12.5px] font-medium text-neutral-500 hover:text-neutral-900"
        >
          Discussion · {messages.length} message{messages.length === 1 ? "" : "s"}
          <ChevronUp className={`size-3.5 transition ${showThread ? "" : "rotate-180"}`} />
        </button>
      )}
      {/* the conversation with this box's own agent */}
      {(showThread || typing) && (messages.length > 0 || typing) && (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pb-1 pt-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neutral-900 px-3.5 py-2 text-[13px] leading-relaxed text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <AgentBubble key={m.id}>
                <span className="whitespace-pre-line">{m.text}</span>
                {m.proposal && <ProposalCard message={m} onAccept={canEdit ? () => acceptProposal(m) : undefined} />}
              </AgentBubble>
            ),
          )}
          {typing && (
            <div className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-neutral-100 py-2.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="space-y-2.5 px-5 pb-4 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {prompts.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={Boolean(typingFor)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-[12.5px] text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white py-1.5 pl-3.5 pr-1.5 focus-within:border-neutral-900"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about this ${noun}...`}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={!draft.trim() || Boolean(typingFor)}
            className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white transition hover:bg-neutral-700 disabled:bg-neutral-300"
            title="Send"
          >
            <Send className="size-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-neutral-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-neutral-800">
      {children}
    </div>
  );
}

function ProposalCard({ message, onAccept }: { message: ChatMessage; onAccept?: () => void }) {
  const p = message.proposal!;
  const isExp = p.kind === "experiment";
  return (
    <div
      className="mt-3 rounded-xl border border-neutral-300 bg-white p-3"
    >
      <p
        className="mb-1 flex items-center gap-1 text-[11px] font-medium text-neutral-600"
      >
        {isExp ? <FlaskConical className="size-3" /> : <GitBranch className="size-3" />}
        Proposed {isExp ? "experiment" : "sub-hypothesis"}
      </p>
      <p className="text-[13px] font-medium leading-snug text-slate-800">{p.title}</p>
      {p.expectedResult && (
        <p className="mt-1 text-[12px] text-slate-500">Expected: {shorten(p.expectedResult, 110)}</p>
      )}
      {message.proposalAccepted ? (
        <p className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
          <Check className="size-3.5" /> Added to the tree
        </p>
      ) : !onAccept ? (
        <p className="mt-2 text-[12px] text-neutral-500">An editor can add this to the tree.</p>
      ) : (
        <button
          onClick={onAccept}
          className="mt-2 w-full rounded-lg bg-slate-900 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800"
        >
          Approve &amp; add to tree
        </button>
      )}
    </div>
  );
}
