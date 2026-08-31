import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "צ'אטים | JoinUp",
};

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
