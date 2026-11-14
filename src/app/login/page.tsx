import { Suspense } from "react";
import { Network } from "lucide-react";
import { GoogleSignInButton } from "./GoogleSignInButton";

export const metadata = { title: "Sign in · HypoTree" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-700 text-white">
            <Network className="size-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in to HypoTree</h1>
          <p className="text-sm text-slate-500">
            Scientists and AI working together to test a hypothesis
          </p>
        </div>

        <Suspense fallback={<GoogleSignInButton next="/" />}>
          <SignInArea searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignInArea({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <GoogleSignInButton next={typeof next === "string" ? next : "/"} />;
}
