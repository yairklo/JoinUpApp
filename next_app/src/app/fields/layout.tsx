import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מגרשים | JoinUp",
};

export default function FieldsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
