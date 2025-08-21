import { ReactNode } from "react";

export default function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={["py-8 md:py-12", className].filter(Boolean).join(" ")}> 
      {title && <h2 className="text-xl md:text-2xl font-semibold mb-4">{title}</h2>}
      {children}
    </section>
  );
}


