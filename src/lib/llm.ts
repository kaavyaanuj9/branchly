import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// One place that talks to Claude, with two interchangeable backends:
//
//   api          the Anthropic API (needs ANTHROPIC_API_KEY). Use for any shared
//                or deployed instance.
//   claude-code  your logged-in Claude Code, run headless (`claude -p`) with tools,
//                MCP servers and saved sessions switched off. No API key needed;
//                meant for personal, local use of your own Claude account.
//
// AI_BACKEND=auto (default) uses the API when a key is set, else Claude Code.
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

const API_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
const CLI_MODEL = process.env.CLAUDE_CODE_MODEL?.trim() || "sonnet";
const CLI_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_TIMEOUT_MS || 180_000);

export function backendName(): "api" | "claude-code" {
  const choice = (process.env.AI_BACKEND || "auto").trim();
  if (choice === "api" || choice === "claude-code") return choice;
  return process.env.ANTHROPIC_API_KEY?.trim() ? "api" : "claude-code";
}

/** Send a system prompt + conversation to Claude and return its text reply. */
export async function complete({
  system,
  messages,
  maxTokens,
}: {
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
}): Promise<string> {
  return backendName() === "api"
    ? completeWithApi(system, messages, maxTokens)
    : completeWithClaudeCode(system, messages);
}

// ── Anthropic API ───────────────────────────────────────────────────────────

async function completeWithApi(system: string, messages: LLMMessage[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_BACKEND=api but ANTHROPIC_API_KEY is not set in .env.local.");
  }
  const client = new Anthropic({ apiKey });
  // On a safety decline the API re-runs the request on a suitable fallback model.
  const response = await client.beta.messages.create({
    model: API_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined this request. Try rephrasing it.");
  }
  return response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n");
}

// ── Claude Code (your login) ────────────────────────────────────────────────

/** `CLAUDE_BIN`, else `claude` on PATH, else the newest copy bundled with the Claude desktop app. */
function findClaudeBinary(): string {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH || "").split(":")) {
    const p = join(dir, "claude");
    if (dir && existsSync(p)) return p;
  }
  const root = join(homedir(), "Library/Application Support/Claude/claude-code");
  if (existsSync(root)) {
    const versions = readdirSync(root).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const v of versions.reverse()) {
      for (const build of readdirSync(join(root, v))) {
        const p = join(root, v, build, "claude.app/Contents/MacOS/claude");
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error(
    "No AI backend: set ANTHROPIC_API_KEY in .env.local, or install Claude Code and log in " +
      "(or set CLAUDE_BIN to its path).",
  );
}

/** Claude Code takes one prompt, so earlier turns are written out as a transcript. */
function toPrompt(messages: LLMMessage[]): string {
  if (messages.length === 1) return messages[0].content;
  const earlier = messages.slice(0, -1).map((m) => `[${m.role}]: ${m.content}`).join("\n\n");
  return `Conversation so far:\n\n${earlier}\n\n[user, now]: ${messages[messages.length - 1].content}`;
}

function completeWithClaudeCode(system: string, messages: LLMMessage[]): Promise<string> {
  const bin = findClaudeBinary();
  // An empty working folder, so no project instructions or files leak into the prompt.
  const cwd = mkdtempSync(join(tmpdir(), "hypotree-claude-"));
  const args = [
    "-p",
    "--output-format", "json",
    "--system-prompt", system,
    "--tools", "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--model", CLI_MODEL,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude Code did not answer within ${CLI_TIMEOUT_MS / 1000}s.`));
    }, CLI_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Claude Code (${bin}): ${e.message}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(cwd, { recursive: true, force: true });
      try {
        const parsed = JSON.parse(out) as { result?: string; is_error?: boolean };
        if (parsed.is_error || typeof parsed.result !== "string") {
          reject(new Error(`Claude Code returned an error: ${parsed.result || err || "unknown"}`));
        } else {
          resolve(parsed.result);
        }
      } catch {
        reject(new Error(`Claude Code gave an unreadable reply. ${err.slice(0, 300) || out.slice(0, 300)}`));
      }
    });
    child.stdin.end(toPrompt(messages));
  });
}
