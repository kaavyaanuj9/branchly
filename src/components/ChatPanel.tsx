"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, FlaskConical, GitBranch, SendHorizontal, X } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { childrenOf, findNode, shorten } from "@/lib/tree";
import type { ChatMessage, TreeNode } from "@/lib/types";
import { QUICK_PROMPTS, agentIntro, agentLabel, getAgentReply } from "@/lib/mockAgent";
import { useUI } from "./uiContext";

// The right column: an AI assistant dedicated to the selected box (DG3).
// Each box keeps its own chat history.

export function ChatPanel({ node }: { node: TreeNode }) {
  const { state, dispatch } = useStore();
  const { setChatOpen } = useUI();
  const [draft, setDraft] = useState("");
  const [typingFor, setTypingFor] = useState<string | null>(null);
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

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l-[3px] border-indigo-700 bg-white xl:w-[400px]">
      {/* Header */}
      <div className="border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white">
            <Bot className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                {agentLabel(node)}
              </p>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">
                Claude Sonnet 5.5
              </span>
            </div>
            <p className="text-[11.5px] text-slate-400">Agent for:</p>
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-slate-900">
              {node.title}
            </p>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Hide chat"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          This conversation is dedicated to this {node.kind === "experiment" ? "experiment" : "hypothesis"}.
          Each node has its own agent with its own context.
        </p>
      </div>

      {/* Quick prompts */}
      <div className="flex flex-col items-start gap-1.5 border-b border-slate-100 px-5 py-3">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={Boolean(typingFor)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12.5px] text-slate-700 shadow-[0_1px_1px_rgba(0,0,0,0.03)] transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <AgentBubble>{agentIntro(node)}</AgentBubble>
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-700 px-3.5 py-2 text-[13.5px] leading-relaxed text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <AgentBubble key={m.id}>
              <span className="whitespace-pre-line">{m.text}</span>
              {m.proposal && (
                <ProposalCard
                  message={m}
                  onAccept={() => acceptProposal(m)}
                />
              )}
            </AgentBubble>
          ),
        )}
        {typing && (
          <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 py-3">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="size-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-slate-100 px-5 py-4"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          placeholder="Ask this agent… (Enter to send)"
          className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={!draft.trim() || Boolean(typingFor)}
          className="flex size-9 items-center justify-center rounded-lg bg-indigo-700 text-white transition hover:bg-indigo-800 disabled:bg-slate-300"
          title="Send"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </aside>
  );
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-slate-700">
      {children}
    </div>
  );
}

function ProposalCard({ message, onAccept }: { message: ChatMessage; onAccept: () => void }) {
  const p = message.proposal!;
  const isExp = p.kind === "experiment";
  return (
    <div
      className={`mt-3 rounded-xl border bg-white p-3 ${
        isExp ? "border-rose-200" : "border-indigo-200"
      }`}
    >
      <p
        className={`mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
          isExp ? "text-rose-600" : "text-indigo-600"
        }`}
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
