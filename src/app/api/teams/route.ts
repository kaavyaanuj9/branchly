import { NextResponse } from "next/server";
import { getAdminDb, handle, profileOf, requireSession } from "@/lib/firebase/admin";
import { readJson, requireName } from "@/lib/firebase/validate";

// Create a research team. The creator becomes its owner.
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const name = requireName((await readJson<{ name: string }>(request)).name, "Team name");

  const ref = getAdminDb().collection("teams").doc();
  await ref.set({
    name,
    personal: false,
    roles: { [session.uid]: "owner" },
    memberIds: [session.uid],
    members: { [session.uid]: profileOf(session) },
    createdAt: Date.now(),
  });
  return NextResponse.json({ id: ref.id });
});
