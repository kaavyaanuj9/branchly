import { Suspense } from "react";
import { TeamPage } from "@/components/teams/TeamPage";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export default function Page({ params }: PageProps<"/teams/[teamId]">) {
  return (
    <Suspense>
      <TeamRoute params={params} />
    </Suspense>
  );
}

async function TeamRoute({ params }: Pick<PageProps<"/teams/[teamId]">, "params">) {
  const { teamId } = await params;
  return (
    <SignedIn>
      <TeamPage teamId={teamId} />
    </SignedIn>
  );
}
