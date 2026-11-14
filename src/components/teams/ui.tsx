"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ROLE_LABEL } from "@/lib/teams";
import type { Role } from "@/lib/types";

export function CenteredSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center text-neutral-400">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-neutral-500">
        This {what} doesn&rsquo;t exist, or you&rsquo;re not a member of it.
        <Link href="/" className="font-medium text-neutral-900 hover:underline">
          Back to your teams
        </Link>
      </div>
    </div>
  );
}

/** Page frame for the team screens: header plus a centred, scrollable column. */
export function Page({
  crumbs,
  children,
}: {
  crumbs?: Parameters<typeof AppHeader>[0]["crumbs"];
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <AppHeader crumbs={crumbs} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

const BUTTON = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  ghost: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-neutral-1000 focus:ring-2 focus:ring-neutral-100";

const ROLE_STYLE: Record<Role, string> = {
  owner: "bg-neutral-100 text-neutral-900",
  editor: "bg-emerald-50 text-emerald-700",
  viewer: "bg-amber-50 text-amber-700",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-rose-600">{children}</p> : null;
}

export function timeAgo(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ms).toLocaleDateString();
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
