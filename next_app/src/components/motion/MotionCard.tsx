"use client";

import Card from "@mui/material/Card";
import { motion } from "framer-motion";

/** MUI Card with tasteful hover/press micro-interactions baked in. */
export const MotionCard = motion.create(Card);

export const cardHoverProps = {
  whileHover: { y: -6, scale: 1.015 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
} as const;
