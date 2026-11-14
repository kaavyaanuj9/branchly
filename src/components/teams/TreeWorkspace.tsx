"use client";

import { HypoTreeApp } from "@/components/HypoTreeApp";
import { useTeam } from "@/lib/teams";
import { CenteredSpinner, NotFound } from "./ui";

export function TreeWorkspace({ teamId, treeId }: { teamId: string; treeId: string }) {
  const { data: team, loading } = useTeam(teamId);
  if (loading) return <CenteredSpinner />;
  if (!team) return <NotFound what="team" />;
  return <HypoTreeApp team={team} treeId={treeId} />;
}
