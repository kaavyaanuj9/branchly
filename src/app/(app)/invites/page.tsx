import { InvitesInbox } from "@/components/teams/InvitesInbox";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export const metadata = { title: "Team invites · HypoTree" };

export default function InvitesPage() {
  return (
    <SignedIn>
      <InvitesInbox />
    </SignedIn>
  );
}
