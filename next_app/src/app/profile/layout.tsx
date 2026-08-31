import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הפרופיל שלי | JoinUp",
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
