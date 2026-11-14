"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Network } from "lucide-react";
import { UserMenu } from "./UserMenu";

export interface Crumb {
  label: string;
  href?: string;
}

/** Top bar shared by every signed-in page: logo, breadcrumb, user menu. */
export function AppHeader({ crumbs = [], children }: { crumbs?: Crumb[]; children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5">
      <nav className="flex min-w-0 items-center gap-2 text-[15px]">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-indigo-800"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-700 text-white">
            <Network className="size-4" />
          </span>
          HypoTree
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2">
            <ChevronRight className="size-4 shrink-0 text-slate-300" />
            {c.href ? (
              <Link href={c.href} className="truncate text-slate-500 hover:text-slate-900">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-slate-900">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-4 text-sm text-slate-500">
        {children}
        <UserMenu />
      </div>
    </header>
  );
}
