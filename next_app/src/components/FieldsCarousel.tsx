"use client";
import { useEffect, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { alpha, useTheme } from "@mui/material/styles";
// In RTL "forward/next" points visually left, so ArrowBack is the correct
// glyph for "next" and ArrowForward for "prev" -- same convention as
// GamesHorizontalList.tsx's "see all" arrow.
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import FieldCard from "@/components/FieldCard";
import { Reveal } from "@/components/motion/Reveal";

type Field = { id: string; name: string; location: string };

export default function FieldsCarousel({ fields }: { fields: Field[] }) {
  const theme = useTheme();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Track which card is most visible in the scroller so the dots/arrows stay
  // in sync with manual swipe/scroll -- deliberately avoids scrollLeft math,
  // which has inconsistent sign conventions across browsers in RTL layouts.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || fields.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.intersectionRatio > (best?.intersectionRatio ?? 0)) best = entry;
        }
        if (best && best.intersectionRatio > 0) {
          const idx = itemRefs.current.findIndex((el) => el === best!.target);
          if (idx !== -1) setActiveIndex(idx);
        }
      },
      { root: scroller, threshold: [0.5, 0.75, 1] }
    );
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [fields.length]);

  if (!fields || fields.length === 0) return null;

  const scrollToIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(fields.length - 1, idx));
    itemRefs.current[clamped]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <Reveal>
      <Box sx={{ position: "relative" }}>
        <Stack
          ref={scrollerRef}
          direction="row"
          spacing={2}
          className="carousel-edge"
          sx={{
            overflowX: "auto",
            py: 1,
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            scrollSnapType: "x mandatory",
            scrollPaddingInline: 8,
            WebkitOverflowScrolling: "touch",
            "& > *": { scrollSnapAlign: "start" },
          }}
        >
          {fields.map((f, i) => (
            <Box
              key={f.id}
              ref={(el: HTMLDivElement | null) => {
                itemRefs.current[i] = el;
              }}
              sx={{ minWidth: 280, flexShrink: 0 }}
            >
              <FieldCard field={{ id: f.id, name: f.name, location: f.location, price: 0, rating: 0, type: "open" }} />
            </Box>
          ))}
        </Stack>

        {fields.length > 1 && (
          <>
            <IconButton
              aria-label="המגרש הבא"
              onClick={() => scrollToIndex(activeIndex + 1)}
              disabled={activeIndex >= fields.length - 1}
              size="small"
              sx={{
                display: { xs: "none", md: "inline-flex" },
                position: "absolute",
                insetInlineEnd: 4,
                top: "40%",
                transform: "translateY(-50%)",
                zIndex: 2,
                bgcolor: "background.paper",
                boxShadow: 3,
                border: "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "background.paper" },
                "&.Mui-disabled": { opacity: 0.35, bgcolor: "background.paper" },
              }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="המגרש הקודם"
              onClick={() => scrollToIndex(activeIndex - 1)}
              disabled={activeIndex <= 0}
              size="small"
              sx={{
                display: { xs: "none", md: "inline-flex" },
                position: "absolute",
                insetInlineStart: 4,
                top: "40%",
                transform: "translateY(-50%)",
                zIndex: 2,
                bgcolor: "background.paper",
                boxShadow: 3,
                border: "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "background.paper" },
                "&.Mui-disabled": { opacity: 0.35, bgcolor: "background.paper" },
              }}
            >
              <ArrowForwardIcon fontSize="small" />
            </IconButton>
          </>
        )}

        {fields.length > 1 && (
          <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center" sx={{ mt: 1 }}>
            {fields.map((f, i) => (
              <Box
                key={f.id}
                component="button"
                type="button"
                aria-label={`עבור למגרש ${i + 1} מתוך ${fields.length}`}
                aria-current={i === activeIndex}
                onClick={() => scrollToIndex(i)}
                sx={{
                  width: i === activeIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  border: 0,
                  p: 0,
                  cursor: "pointer",
                  bgcolor: i === activeIndex ? "primary.main" : alpha(theme.palette.text.primary, 0.18),
                  transition: "width 0.2s ease, background-color 0.2s ease",
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Reveal>
  );
}
