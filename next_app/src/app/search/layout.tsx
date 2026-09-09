import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מפת משחקים | JoinUp",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
