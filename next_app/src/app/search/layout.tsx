import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "חיפוש משחקים | JoinUp",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
