import { Suspense } from "react";
import { LoginCard } from "@/components/LoginCard";

export const metadata = { title: "Sign in · Branchly" };

// Sign in with Google (Firebase). Signed-in visitors are sent on by src/proxy.ts.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#f7f7f6]" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  // new sign-ins start in the idea studio unless they were heading somewhere
  return <LoginCard next={typeof next === "string" ? next : "/new"} />;
}
