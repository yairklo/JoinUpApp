import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "בניהולי | JoinUp",
};

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
