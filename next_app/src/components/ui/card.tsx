import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };

export function Card({ className = "", ...props }: DivProps) {
  return <div className={["rounded-2xl border border-[rgb(var(--border))] bg-white/90 shadow-sm", className].join(" ")} {...props} />;
}

export function CardHeader({ className = "", ...props }: DivProps) {
  return <div className={["p-6", className].join(" ")} {...props} />;
}

export function CardContent({ className = "", ...props }: DivProps) {
  return <div className={["p-6 pt-0", className].join(" ")} {...props} />;
}


