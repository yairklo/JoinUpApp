"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
// In RTL "next" points visually left, so ArrowBack is the glyph for "next" -- same convention
// as FieldsCarousel.tsx.
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { fieldPhotoSrc } from "@/services/api/fieldPhotos";

/**
 * Index tracking and navigation for a horizontal scroll-snap strip. The active slide comes from
 * an IntersectionObserver rather than scrollLeft, whose sign differs across browsers in RTL.
 */
export function useSnapCarousel(count: number, enabled = true) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const slideRefs = useRef<(HTMLElement | null)[]>([]);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!enabled || !scroller || count === 0) return;
        const observer = new IntersectionObserver(
            (entries) => {
                let best: IntersectionObserverEntry | null = null;
                for (const entry of entries) {
                    if (entry.intersectionRatio > (best?.intersectionRatio ?? 0)) best = entry;
                }
                if (best && best.intersectionRatio >= 0.5) {
                    const i = slideRefs.current.findIndex((el) => el === best!.target);
                    if (i !== -1) setIndex(i);
                }
            },
            { root: scroller, threshold: [0.5, 0.75, 1] },
        );
        slideRefs.current.slice(0, count).forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, [count, enabled]);

    // A removed photo can leave the index past the end.
    useEffect(() => {
        if (count > 0 && index > count - 1) setIndex(count - 1);
    }, [count, index]);

    const goTo = useCallback(
        (target: number, behavior?: ScrollBehavior) => {
            const clamped = Math.max(0, Math.min(count - 1, target));
            const reduce =
                typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            slideRefs.current[clamped]?.scrollIntoView({
                behavior: behavior ?? (reduce ? "auto" : "smooth"),
                inline: "center",
                block: "nearest",
            });
        },
        [count],
    );

    /** Arrow keys follow what the user sees: in RTL, left is the next photo. */
    const onKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            const rtl = scrollerRef.current ? getComputedStyle(scrollerRef.current).direction === "rtl" : true;
            const forward = (e.key === "ArrowLeft") === rtl;
            e.preventDefault();
            goTo(index + (forward ? 1 : -1));
        },
        [goTo, index],
    );

    return { scrollerRef, slideRefs, index, goTo, onKeyDown };
}

export const snapStripSx = {
    display: "flex",
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorX: "contain",
    "&::-webkit-scrollbar": { display: "none" },
    "& > *": { flex: "0 0 100%", scrollSnapAlign: "center", scrollSnapStop: "always" },
} as const;

export const overlayButtonSx = {
    bgcolor: "rgba(0,0,0,0.5)",
    color: "#fff",
    backdropFilter: "blur(4px)",
    "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
    "&.Mui-focusVisible": { outline: "2px solid #fff", outlineOffset: 2 },
    "&.Mui-disabled": { bgcolor: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.4)" },
} as const;

interface FieldPhotoViewerProps {
    open: boolean;
    onClose: () => void;
    fieldName: string;
    photos: { id: string; url: string }[];
    startIndex: number;
}

/** Fullscreen photo viewer: the same swipeable strip as the gallery, on black, uncropped. */
export default function FieldPhotoViewer({ open, onClose, fieldName, photos, startIndex }: FieldPhotoViewerProps) {
    const total = photos.length;
    const { scrollerRef, slideRefs, index, goTo, onKeyDown } = useSnapCarousel(total, open);

    // Jump (no animation) to the photo that was tapped once the dialog content is in the DOM.
    const handleEntered = useCallback(() => {
        goTo(startIndex, "auto");
        scrollerRef.current?.focus();
    }, [goTo, startIndex, scrollerRef]);

    if (total === 0) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen
            dir="rtl"
            aria-label={`גלריית תמונות - ${fieldName}`}
            slotProps={{ transition: { onEntered: handleEntered }, paper: { sx: { bgcolor: "#000" } } }}
        >
            <Box sx={{ position: "relative", width: "100%", height: "100%", color: "#fff" }}>
                <Box
                    ref={scrollerRef}
                    tabIndex={0}
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={`תמונות של ${fieldName}`}
                    onKeyDown={onKeyDown}
                    sx={{ ...snapStripSx, height: "100%", outline: "none" }}
                >
                    {photos.map((photo, i) => (
                        <Box
                            key={photo.id}
                            ref={(el: HTMLElement | null) => {
                                slideRefs.current[i] = el;
                            }}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} מתוך ${total}`}
                            sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                            {/* Only the current photo and its neighbours are requested at full size. */}
                            {Math.abs(i - index) <= 1 || i === startIndex ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={fieldPhotoSrc(photo.url, 2000)}
                                    alt={`${fieldName} - תמונה ${i + 1} מתוך ${total}`}
                                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                                    draggable={false}
                                />
                            ) : null}
                        </Box>
                    ))}
                </Box>

                <IconButton
                    onClick={onClose}
                    aria-label="סגירת הגלריה"
                    sx={{ ...overlayButtonSx, position: "absolute", top: 12, insetInlineStart: 12 }}
                >
                    <CloseIcon />
                </IconButton>

                {total > 1 && (
                    <>
                        <Typography
                            aria-live="polite"
                            variant="body2"
                            sx={{
                                position: "absolute",
                                top: 20,
                                left: "50%",
                                transform: "translateX(-50%)",
                                px: 1.5,
                                py: 0.25,
                                borderRadius: 999,
                                bgcolor: "rgba(0,0,0,0.5)",
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            <span dir="ltr">{`${index + 1} / ${total}`}</span>
                        </Typography>
                        <IconButton
                            onClick={() => goTo(index - 1)}
                            disabled={index === 0}
                            aria-label="התמונה הקודמת"
                            sx={{
                                ...overlayButtonSx,
                                position: "absolute",
                                top: "50%",
                                insetInlineStart: 12,
                                transform: "translateY(-50%)",
                                display: { xs: "none", sm: "inline-flex" },
                            }}
                        >
                            <ArrowForwardIcon />
                        </IconButton>
                        <IconButton
                            onClick={() => goTo(index + 1)}
                            disabled={index === total - 1}
                            aria-label="התמונה הבאה"
                            sx={{
                                ...overlayButtonSx,
                                position: "absolute",
                                top: "50%",
                                insetInlineEnd: 12,
                                transform: "translateY(-50%)",
                                display: { xs: "none", sm: "inline-flex" },
                            }}
                        >
                            <ArrowBackIcon />
                        </IconButton>
                    </>
                )}
            </Box>
        </Dialog>
    );
}
