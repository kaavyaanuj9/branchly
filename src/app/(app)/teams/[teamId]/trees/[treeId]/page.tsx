import { Suspense } from "react";
import { TreeWorkspace } from "@/components/teams/TreeWorkspace";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export default function Page({ params }: PageProps<"/teams/[teamId]/trees/[treeId]">) {
  return (
    <Suspense>
      <TreeRoute params={params} />
    </Suspense>
  );
}

async function TreeRoute({ params }: Pick<PageProps<"/teams/[teamId]/trees/[treeId]">, "params">) {
  const { teamId, treeId } = await params;
  return (
    <SignedIn>
      <TreeWorkspace teamId={teamId} treeId={treeId} />
    </SignedIn>
  );
}
