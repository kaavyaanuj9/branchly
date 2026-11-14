"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { createTree } from "@/lib/teams";
import type { ChatMessage, TreeNode } from "@/lib/types";
import { IdeaStudio } from "../IdeaStudio";

/** The idea studio as a page; the grown tree is saved to the team and opened. */
export function NewIdea({ teamId }: { teamId?: string }) {
  const router = useRouter();
  const { uid, name, email } = useCurrentUser();
  const team = teamId || `personal_${uid}`;
  const onCreate = useCallback(
    async ({ title, nodes, chats }: { title: string; nodes: TreeNode[]; chats: Record<string, ChatMessage[]> }) => {
      const id = await createTree(team, uid, title, nodes, chats);
      router.push(`/teams/${team}/trees/${id}`);
    },
    [team, uid, router],
  );
  return (
    <IdeaStudio
      user={{ name: name || email.split("@")[0], email }}
      onCreate={onCreate}
      onClose={() => router.push(teamId ? `/teams/${teamId}` : "/")}
    />
  );
}
