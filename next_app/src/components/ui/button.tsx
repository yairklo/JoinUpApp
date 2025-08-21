"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
};

const base = "inline-flex items-center justify-center font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<string, string> = {
  default: "bg-primary text-white hover:opacity-95",
  secondary: "border border-[rgb(var(--border))] bg-white text-[rgb(var(--fg))] hover:bg-[rgb(var(--muted))]",
  ghost: "bg-transparent text-[rgb(var(--fg))] hover:bg-[rgb(var(--muted))]",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizes: Record<string, string> = {
  sm: "h-8 px-2.5 text-xs rounded-md",
  md: "h-9 px-3 text-sm rounded-md",
  lg: "h-10 px-4 text-sm rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "md", asChild, ...props }, ref) => {
    const Comp: any = asChild ? Slot : "button";
    const cls = [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");
    return <Comp ref={ref} className={cls} {...props} />;
  }
);
Button.displayName = "Button";


