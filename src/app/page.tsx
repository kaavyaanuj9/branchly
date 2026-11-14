import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { HypoTreeApp } from "@/components/HypoTreeApp";
import { SESSION_COOKIE, verifySession } from "@/lib/firebase/admin";

// The home page ("/") shows the HypoTree workspace for the signed-in user.
// The proxy already redirects signed-out visitors to /login.
export default function Home() {
  return (
    <Suspense fallback={<div className="h-dvh bg-white" />}>
      <SignedInWorkspace />
    </Suspense>
  );
}

async function SignedInWorkspace() {
  await connection();
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  const user = session
    ? {
        email: session.email ?? "",
        name: (session.name as string | undefined) ?? session.email ?? "",
        avatarUrl: session.picture ?? null,
      }
    : null;

  return <HypoTreeApp user={user} />;
}
