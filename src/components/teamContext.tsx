"use client";

import { createContext, useContext } from "react";
import type { MemberProfile, Team } from "@/lib/types";

// The team that owns the open tree, so boxes and panels can show who's who.

export const TeamContext = createContext<{ team: Team; uid: string } | null>(null);

export function useTeamContext() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeamContext must be used inside <TeamContext.Provider>");
  return ctx;
}

const FORMER: MemberProfile = { name: "Former member", email: "", photoURL: null };

/** Profile for a uid; people who've left the team still render sensibly. */
export function memberProfile(team: Team, uid: string): MemberProfile {
  return team.members[uid] ?? FORMER;
}
