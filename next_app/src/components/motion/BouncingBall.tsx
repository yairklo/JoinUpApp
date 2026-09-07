"use client";

import { motion, useReducedMotion, type Easing } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const EASE_UP: Easing = [0, 0.55, 0.45, 1];
const EASE_DOWN: Easing = [0.55, 0, 1, 0.45];

/**
 * A simplified, bold soccer-ball glyph (outer circle + center pentagon + seam
 * lines) tuned to stay legible at small sizes, colored via the app's primary
 * (brand green) so it reads as an accent rather than a gray blob.
 */
function SoccerBallSvg({ size = 44 }: { size?: number }) {
  const pentagon = "20,13.5 24.2,16.6 22.6,21.5 17.4,21.5 15.8,16.6";
  const seams: Array<[number, number, number, number]> = [
    [20, 13.5, 20, 4],
    [24.2, 16.6, 33, 13.8],
    [22.6, 21.5, 29.5, 28.5],
    [17.4, 21.5, 10.5, 28.5],
    [15.8, 16.6, 7, 13.8],
  ];
  return (
    <Box
      component="svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      sx={{ display: "block", color: "primary.main" }}
    >
      <circle cx="20" cy="20" r="18" fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth="2" />
      <polygon points={pentagon} fill="currentColor" />
      {seams.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      ))}
    </Box>
  );
}

/**
 * Bouncing-ball loading indicator used as the shared "page is loading" motif
 * (games/[id]/loading.tsx and friends). Falls back to a static ball + pulsing
 * label when the user prefers reduced motion.
 */
export default function BouncingBall({ label }: { label?: string }) {
  const reduced = useReducedMotion();
  const ballSize = 44;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
      <Box sx={{ position: "relative", width: ballSize, height: ballSize * 1.8 }}>
        {reduced ? (
          <Box sx={{ position: "absolute", insetInline: 0, bottom: 0 }}>
            <SoccerBallSvg size={ballSize} />
          </Box>
        ) : (
          <>
            <motion.div
              style={{ position: "absolute", insetInline: 0, bottom: 0 }}
              animate={{ y: [0, -ballSize * 1.2, 0], rotate: [0, 200, 360] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                times: [0, 0.45, 1],
                ease: [EASE_UP, EASE_DOWN],
              }}
            >
              <SoccerBallSvg size={ballSize} />
            </motion.div>
            <motion.div
              style={{
                position: "absolute",
                bottom: -2,
                left: "50%",
                width: ballSize,
                height: 8,
                marginLeft: -ballSize / 2,
                borderRadius: "50%",
                background: "rgba(15,23,42,0.35)",
                filter: "blur(1px)",
              }}
              animate={{ scaleX: [1, 0.5, 1], opacity: [0.28, 0.08, 0.28] }}
              transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.45, 1], ease: "easeInOut" }}
            />
          </>
        )}
      </Box>
      {label && (
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
      )}
    </Box>
  );
}
