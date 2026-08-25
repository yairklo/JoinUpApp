import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הגדרות פרטיות | JoinUp",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
