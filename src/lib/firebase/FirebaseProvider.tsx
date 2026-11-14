"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { getClientAuth } from "./client";
import { setActingUid } from "@/lib/teams";
import type { MemberProfile } from "@/lib/types";

export interface CurrentUser extends MemberProfile {
  uid: string;
}

type AuthState = { user: CurrentUser | null; error: string | null };

const AuthContext = createContext<AuthState>({ user: null, error: null });

/** The signed-in user. Only usable inside <SignedIn>. */
export function useCurrentUser(): CurrentUser {
  const { user } = useContext(AuthContext);
  if (!user) throw new Error("useCurrentUser must be used inside <SignedIn>");
  return user;
}

/**
 * Signs this tab's Firebase SDK in as the session-cookie user (via a custom
 * token) so Firestore works. Always renders its children; pages wrap their
 * content in <SignedIn> to wait for it.
 */
export function FirebaseProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ user: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/token");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Couldn't load your account");
      const { uid, token, profile } = (await res.json()) as {
        uid: string;
        token: string;
        profile: MemberProfile;
      };
      await signInWithCustomToken(getClientAuth(), token);
      setActingUid(uid);
      if (!cancelled) setState({ user: { uid, ...profile }, error: null });
    })().catch((e: unknown) => {
      if (!cancelled) {
        setState({
          user: null,
          error: e instanceof Error ? e.message : "Couldn't load your account",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Shows a spinner until the signed-in user is ready, then renders its children. */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user, error } = useContext(AuthContext);
  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-rose-700">
        {error}. Try reloading the page.
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return children;
}
