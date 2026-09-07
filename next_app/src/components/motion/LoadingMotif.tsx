"use client";

import { motion, useReducedMotion, type Easing } from "framer-motion";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { LoadingMotifId } from "@joinup/shared";
import type { ReactNode, JSX } from "react";

const EASE_UP: Easing = [0, 0.55, 0.45, 1];
const EASE_DOWN: Easing = [0.55, 0, 1, 0.45];
const LOOP = { repeat: Infinity };

export type MotifProps = { label?: string; size?: number };

function MotifShell({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
      {children}
      {label ? (
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Brand-green soccer ball shared by the sport motifs. */
export function SoccerBallGlyph({ size = 44 }: { size?: number }) {
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

function MapPinGlyph({ size = 36 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 40"
      width={size}
      height={size * 1.25}
      sx={{ display: "block", color: "primary.main" }}
    >
      <path
        d="M16 2C9.4 2 4 7.2 4 14.2 4 23.5 16 38 16 38s12-14.5 12-23.8C28 7.2 22.6 2 16 2z"
        fill="currentColor"
      />
      <circle cx="16" cy="14" r="5" fill="#fff" fillOpacity={0.95} />
    </Box>
  );
}

function PlayerDot({ size = 12 }: { size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: "primary.main",
        boxShadow: "0 0 0 3px rgba(5,150,105,0.18)",
      }}
    />
  );
}

/**
 * Existing game-page loader. Bounce timing/easing must stay in lockstep with
 * mobile_app's bouncing-ball motif.
 */
export function BouncingBallMotif({ label, size = 44 }: MotifProps) {
  const reduced = useReducedMotion();
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: size, height: size * 1.8 }}>
        {reduced ? (
          <Box sx={{ position: "absolute", insetInline: 0, bottom: 0 }}>
            <SoccerBallGlyph size={size} />
          </Box>
        ) : (
          <>
            <motion.div
              style={{ position: "absolute", insetInline: 0, bottom: 0 }}
              animate={{ y: [0, -size * 1.2, 0], rotate: [0, 200, 360] }}
              transition={{
                duration: 0.9,
                ...LOOP,
                times: [0, 0.45, 1],
                ease: [EASE_UP, EASE_DOWN],
              }}
            >
              <SoccerBallGlyph size={size} />
            </motion.div>
            <motion.div
              style={{
                position: "absolute",
                bottom: -2,
                left: "50%",
                width: size,
                height: 8,
                marginLeft: -size / 2,
                borderRadius: "50%",
                background: "rgba(15,23,42,0.35)",
                filter: "blur(1px)",
              }}
              animate={{ scaleX: [1, 0.5, 1], opacity: [0.28, 0.08, 0.28] }}
              transition={{ duration: 0.9, ...LOOP, times: [0, 0.45, 1], ease: "easeInOut" }}
            />
          </>
        )}
      </Box>
    </MotifShell>
  );
}

export function PassingLaneMotif({ label, size = 36 }: MotifProps) {
  const reduced = useReducedMotion();
  const travel = 56;
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: travel * 2 + size, height: size + 40, display: "flex", alignItems: "flex-end", justifyContent: "space-between", px: 0.5 }}>
        <motion.div
          animate={reduced ? undefined : { scale: [1, 1.25, 1, 1, 1] }}
          transition={{ duration: 1.4, ...LOOP, times: [0, 0.08, 0.16, 0.5, 1], ease: "easeInOut" }}
        >
          <PlayerDot />
        </motion.div>
        <motion.div
          animate={reduced ? undefined : { scale: [1, 1, 1.25, 1, 1] }}
          transition={{ duration: 1.4, ...LOOP, times: [0, 0.42, 0.5, 0.58, 1], ease: "easeInOut" }}
        >
          <PlayerDot />
        </motion.div>
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          {reduced ? (
            <SoccerBallGlyph size={size} />
          ) : (
            <motion.div
              animate={{
                x: [-travel, 0, travel, 0, -travel],
                y: [0, -30, 0, -30, 0],
                rotate: [0, 90, 180, 270, 360],
              }}
              transition={{ duration: 1.4, ...LOOP, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
            >
              <SoccerBallGlyph size={size} />
            </motion.div>
          )}
        </Box>
      </Box>
    </MotifShell>
  );
}

export function KickoffRippleMotif({ label, size = 44 }: MotifProps) {
  const reduced = useReducedMotion();
  const frame = size * 2.2;
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: frame, height: frame, display: "flex", alignItems: "center", justifyContent: "center", color: "primary.main" }}>
        {[0, 0.45, 0.9].map((delay) => (
          <motion.div
            key={delay}
            style={{
              position: "absolute",
              width: size * 1.15,
              height: size * 1.15,
              borderRadius: "50%",
              border: "2px solid currentColor",
            }}
            animate={reduced ? { opacity: 0.18, scale: 1.15 } : { scale: [0.45, 2.05], opacity: [0.5, 0] }}
            transition={reduced ? { duration: 0 } : { duration: 1.8, delay, ...LOOP, ease: "easeOut" }}
          />
        ))}
        <SoccerBallGlyph size={size} />
      </Box>
    </MotifShell>
  );
}

export function DribbleMotif({ label, size = 40 }: MotifProps) {
  const reduced = useReducedMotion();
  const travel = 34;
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: travel * 2 + size, height: size * 1.9 }}>
        {reduced ? (
          <Box sx={{ position: "absolute", insetInline: 0, bottom: 0, display: "flex", justifyContent: "center" }}>
            <SoccerBallGlyph size={size} />
          </Box>
        ) : (
          <>
            <motion.div
              style={{ position: "absolute", bottom: 8, left: "50%", marginLeft: -size / 2 }}
              animate={{
                x: [-travel, 0, travel, 0, -travel],
                y: [0, -size * 0.95, 0, -size * 0.95, 0],
                rotate: [0, 90, 180, 270, 360],
              }}
              transition={{ duration: 1.15, ...LOOP, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
            >
              <SoccerBallGlyph size={size} />
            </motion.div>
            <motion.div
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                width: size * 0.85,
                height: 7,
                marginLeft: -(size * 0.85) / 2,
                borderRadius: "50%",
                background: "rgba(15,23,42,0.28)",
                filter: "blur(1px)",
              }}
              animate={{
                x: [-travel, 0, travel, 0, -travel],
                scaleX: [1, 0.55, 1, 0.55, 1],
                opacity: [0.28, 0.1, 0.28, 0.1, 0.28],
              }}
              transition={{ duration: 1.15, ...LOOP, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
            />
          </>
        )}
      </Box>
    </MotifShell>
  );
}

export function BrandPulseMotif({ label }: MotifProps) {
  const reduced = useReducedMotion();
  const frame = 88;
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: frame, height: frame, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {[0, 0.4].map((delay) => (
          <motion.div
            key={delay}
            style={{
              position: "absolute",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#059669",
            }}
            animate={reduced ? { opacity: 0.08, scale: 1 } : { scale: [0.7, 1.7], opacity: [0.28, 0] }}
            transition={reduced ? { duration: 0 } : { duration: 1.6, delay, ...LOOP, ease: "easeOut" }}
          />
        ))}
        <Box
          sx={{
            position: "relative",
            width: 46,
            height: 46,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            fontSize: 15,
            zIndex: 1,
          }}
        >
          JU
        </Box>
      </Box>
    </MotifShell>
  );
}

export function PinDropMotif({ label, size = 36 }: MotifProps) {
  const reduced = useReducedMotion();
  return (
    <MotifShell label={label}>
      <Box sx={{ position: "relative", width: size + 16, height: size * 1.7, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {reduced ? (
          <MapPinGlyph size={size} />
        ) : (
          <>
            <motion.div
              style={{ position: "absolute", bottom: 10 }}
              animate={{ y: [-36, 0, -8, 0], scaleY: [1, 0.88, 1.04, 1] }}
              transition={{ duration: 1.35, ...LOOP, times: [0, 0.45, 0.7, 1], ease: "easeInOut" }}
            >
              <MapPinGlyph size={size} />
            </motion.div>
            <motion.div
              style={{
                position: "absolute",
                bottom: 2,
                width: size * 0.7,
                height: 8,
                borderRadius: "50%",
                background: "rgba(15,23,42,0.28)",
                filter: "blur(1px)",
              }}
              animate={{ scaleX: [0.35, 1, 0.7, 1], opacity: [0.05, 0.28, 0.16, 0.28] }}
              transition={{ duration: 1.35, ...LOOP, times: [0, 0.45, 0.7, 1], ease: "easeInOut" }}
            />
          </>
        )}
      </Box>
    </MotifShell>
  );
}

export function MessageStackMotif({ label }: MotifProps) {
  const reduced = useReducedMotion();
  const bubble = (width: number, align: "flex-start" | "flex-end") => (
    <Box
      sx={{
        width,
        height: 26,
        borderRadius: 2.5,
        bgcolor: align === "flex-end" ? "primary.main" : "action.selected",
        alignSelf: align,
      }}
    />
  );
  return (
    <MotifShell label={label}>
      <Box sx={{ width: 92, display: "flex", flexDirection: "column", gap: 1 }}>
        {reduced ? (
          <>
            {bubble(58, "flex-start")}
            {bubble(72, "flex-end")}
          </>
        ) : (
          <>
            <motion.div
              style={{ alignSelf: "flex-start" }}
              animate={{ opacity: [0.25, 1, 1, 0.25], x: [10, 0, 0, 10] }}
              transition={{ duration: 1.8, ...LOOP, times: [0, 0.25, 0.7, 1], ease: "easeInOut" }}
            >
              {bubble(58, "flex-start")}
            </motion.div>
            <motion.div
              style={{ alignSelf: "flex-end" }}
              animate={{ opacity: [0.2, 0.2, 1, 1, 0.2], x: [-10, -10, 0, 0, -10] }}
              transition={{ duration: 1.8, ...LOOP, times: [0, 0.2, 0.4, 0.75, 1], ease: "easeInOut" }}
            >
              {bubble(72, "flex-end")}
            </motion.div>
          </>
        )}
      </Box>
    </MotifShell>
  );
}

export function CrowdWaveMotif({ label }: MotifProps) {
  const reduced = useReducedMotion();
  const dots = [0, 1, 2, 3, 4];
  return (
    <MotifShell label={label}>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 36 }}>
        {dots.map((i) =>
          reduced ? (
            <Box
              key={i}
              sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: "primary.main", opacity: 0.55 + i * 0.08 }}
            />
          ) : (
            <motion.div
              key={i}
              animate={{ y: [0, -16, 0] }}
              transition={{ duration: 0.9, delay: i * 0.1, ...LOOP, ease: "easeInOut" }}
            >
              <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: "primary.main" }} />
            </motion.div>
          ),
        )}
      </Box>
    </MotifShell>
  );
}

const MOTIF_COMPONENTS: Record<LoadingMotifId, (props: MotifProps) => JSX.Element> = {
  "bouncing-ball": BouncingBallMotif,
  "passing-lane": PassingLaneMotif,
  "kickoff-ripple": KickoffRippleMotif,
  dribble: DribbleMotif,
  "brand-pulse": BrandPulseMotif,
  "pin-drop": PinDropMotif,
  "message-stack": MessageStackMotif,
  "crowd-wave": CrowdWaveMotif,
};

/** Pick a catalog motif by shared id — same ids as mobile_app. */
export default function LoadingMotif({
  id,
  label,
  size,
}: {
  id: LoadingMotifId;
  label?: string;
  size?: number;
}) {
  const Comp = MOTIF_COMPONENTS[id] ?? BouncingBallMotif;
  return <Comp label={label} size={size} />;
}

/** Centered full-area placeholder for a page-level load. */
export function PageLoading({
  id = "bouncing-ball",
  label,
}: {
  id?: LoadingMotifId;
  label?: string;
}) {
  return (
    <Box
      sx={{
        minHeight: 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
      }}
    >
      <LoadingMotif id={id} label={label} />
    </Box>
  );
}
