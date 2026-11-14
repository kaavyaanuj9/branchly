import { InvitesInbox } from "@/components/teams/InvitesInbox";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export const metadata = { title: "Team invites · Branchly" };

export default function InvitesPage() {
  return (
    <SignedIn>
      <InvitesInbox />
    </SignedIn>
  );
}
