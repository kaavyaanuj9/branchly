import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { HypoTreeApp } from "@/components/HypoTreeApp";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

// The home page ("/"): the HypoTree workspace, for signed-in users.
// "/?start=1" opens the idea studio first (where a new idea becomes a tree).
export default function Home({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#0b1020]" />}>
      <Workspace searchParams={searchParams} />
    </Suspense>
  );
}

async function Workspace({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await connection(); // per request: reads the sign-in cookie and the clock
  const user = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  const { start } = await searchParams;
  return (
    <HypoTreeApp
      user={{ email: user.email, name: user.name, picture: user.picture, demo: user.demo }}
      startInStudio={start === "1"}
    />
  );
}
