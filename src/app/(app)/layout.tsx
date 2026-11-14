import { FirebaseProvider } from "@/lib/firebase/FirebaseProvider";

// Every signed-in page shares one Firebase sign-in, kept across navigations.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
