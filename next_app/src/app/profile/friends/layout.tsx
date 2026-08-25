import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "החברים שלי | JoinUp",
};

export default function FriendsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
