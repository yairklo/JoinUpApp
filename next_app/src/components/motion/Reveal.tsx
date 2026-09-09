"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade-in-up reveal, triggered once when scrolled into view. Honors prefers-reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Always render the same `motion.div` element (never branch to a plain
  // `<div>`) so a client-only prefers-reduced-motion resolution never swaps
  // the underlying element type after hydration -- that swap would force
  // React to unmount+remount this subtree (and everything inside it),
  // replaying its own entrance animation on top of whatever content had
  // already settled in. `initial={false}` on the reduced-motion branch
  // still fully disables the animation, it just keeps the same node.
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

/** Wraps a list of items with a staggered fade-in-up reveal. Honors prefers-reduced-motion. */
export function StaggerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Same rationale as Reveal above: keep a stable `motion.div` element
  // across the reduced-motion branch instead of swapping to a plain `<div>`,
  // so this never remounts (and re-triggers) its children after hydration.
  return (
    <motion.div
      className={className}
      variants={reduced ? undefined : staggerContainer}
      initial={reduced ? false : "hidden"}
      whileInView={reduced ? undefined : "show"}
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} variants={reduced ? undefined : staggerItem}>
      {children}
    </motion.div>
  );
}
