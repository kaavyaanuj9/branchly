"use client";

import Link from "next/link";
import { useRef } from "react";
import { signOut } from "firebase/auth";
import { Inbox, LogOut } from "lucide-react";
import { getClientAuth } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { useMyInvites } from "@/lib/teams";

export function Avatar({
  name,
  photoURL,
  size = "size-7",
}: {
  name: string;
  photoURL: string | null;
  size?: string;
}) {
  return photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoURL}
      alt=""
      referrerPolicy="no-referrer"
      className={`${size} shrink-0 rounded-full`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Invites inbox link with a live count of pending invites. */
export function InvitesBell() {
  const { uid } = useCurrentUser();
  const { data: invites } = useMyInvites(uid);
  return (
    <Link
      href="/invites"
      title={invites.length ? `${invites.length} pending team invite(s)` : "Team invites"}
      className="relative rounded-full p-1 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <Inbox className="size-5" />
      {invites.length > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
          {invites.length}
        </span>
      )}
    </Link>
  );
}

/** Invites bell, avatar + name, and sign-out. */
export function UserMenu() {
  const user = useCurrentUser();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSignOut() {
    // Sign the browser's Firebase SDK out too, then clear the session cookie.
    await signOut(getClientAuth()).catch(() => {});
    formRef.current?.submit();
  }

  return (
    <div className="flex items-center gap-3">
      <InvitesBell />
      <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
        <Avatar name={user.name} photoURL={user.photoURL} />
        <span className="hidden max-w-40 truncate text-slate-700 md:inline" title={user.email}>
          {user.name}
        </span>
        <form ref={formRef} action="/auth/signout" method="post">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full p-1 transition hover:bg-slate-100 hover:text-slate-900"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
