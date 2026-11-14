import { TeamsHome } from "@/components/teams/TeamsHome";
import { SignedIn } from "@/lib/firebase/FirebaseProvider";

export default function Home() {
  return (
    <SignedIn>
      <TeamsHome />
    </SignedIn>
  );
}
