import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginCard } from "@/components/LoginCard";
import { demoAllowed, googleClientId, readSession, SESSION_COOKIE } from "@/lib/auth";

export const metadata = { title: "Sign in · HypoTree" };

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#0b1020]" />}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  await connection(); // per request: reads the sign-in cookie and the clock
  if (readSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/?start=1");
  return <LoginCard googleClientId={googleClientId()} demo={demoAllowed()} />;
}
