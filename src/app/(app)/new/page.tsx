import { Suspense } from "react";
import { NewIdea } from "@/components/teams/NewIdea";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export const metadata = { title: "New idea · Branchly" };

// The idea studio: chat an idea, see it on the field map, grow it into a tree.
// /new?team=<teamId> saves the tree in that team; otherwise in your personal space.
export default function Page({ searchParams }: PageProps<"/new">) {
  return (
    <Suspense>
      <Studio searchParams={searchParams} />
    </Suspense>
  );
}

async function Studio({ searchParams }: Pick<PageProps<"/new">, "searchParams">) {
  const { team } = await searchParams;
  return (
    <SignedIn>
      <NewIdea teamId={typeof team === "string" ? team : undefined} />
    </SignedIn>
  );
}
