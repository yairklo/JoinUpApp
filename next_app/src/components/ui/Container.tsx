import { ReactNode } from "react";

export default function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["max-w-screen-xl mx-auto px-4 md:px-8", className].filter(Boolean).join(" ")}>{children}</div>;
}


