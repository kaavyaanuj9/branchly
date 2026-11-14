"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Wordmark } from "./BranchField";
import { UserMenu } from "./UserMenu";

export interface Crumb {
  label: string;
  href?: string;
}

/** Top bar shared by every signed-in page: logo, breadcrumb, user menu. */
export function AppHeader({ crumbs = [], children }: { crumbs?: Crumb[]; children?: ReactNode }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6">
      <nav className="flex min-w-0 items-center gap-2 text-[15px]">
        <Link href="/" className="shrink-0" title="All teams and trees">
          <Wordmark className="text-[23px]" />
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2">
            <ChevronRight className="size-4 shrink-0 text-neutral-300" />
            {c.href ? (
              <Link href={c.href} className="truncate text-neutral-500 hover:text-neutral-900">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-neutral-900">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-4 text-sm text-neutral-500">
        {children}
        <UserMenu />
      </div>
    </header>
  );
}
