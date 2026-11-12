"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import AddPhotoIcon from "@mui/icons-material/AddPhotoAlternate";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import HourglassIcon from "@mui/icons-material/HourglassTop";
import PhotoCameraIcon from "@mui/icons-material/PhotoCameraOutlined";
import { fieldPhotosApi, fieldPhotoSrc, type FieldPhotosResponse } from "@/services/api/fieldPhotos";
import FieldPhotoViewer, { overlayButtonSx, snapStripSx, useSnapCarousel } from "./FieldPhotoViewer";
import FieldPhotoUploader from "./FieldPhotoUploader";

const HEIGHT = { xs: 220, md: 320 };
const MAX_DOTS = 10;

type Slide = { id: string; url: string; pending: boolean };

function SlideImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
    const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
    // An image served from cache can finish before React attaches onLoad.
    const settle = useCallback((img: HTMLImageElement | null) => {
        if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "failed");
    }, []);

    if (state === "failed") {
        return (
            <Box
                role="img"
                aria-label={alt}
                sx={{
                    width: "100%",
                    height: "100%",
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.disabled",
                }}
            >
                <PhotoCameraIcon fontSize="large" />
            </Box>
        );
    }
    return (
        <>
            {state === "loading" && (
                <Skeleton variant="rectangular" animation="wave" sx={{ position: "absolute", inset: 0, height: "100%" }} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={settle}
                src={src}
                alt={alt}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                onLoad={() => setState("loaded")}
                onError={() => setState("failed")}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: state === "loaded" ? 1 : 0,
                    transition: "opacity 200ms ease",
                }}
            />
        </>
    );
}

interface FieldGalleryProps {
    fieldId: string;
    fieldName: string;
    /** Approved photo URLs rendered on the server, so the first photo paints without a client fetch. */
    initialPhotos: string[];
}

/**
 * The field page's photo header: a swipeable, RTL-aware carousel of the approved photos, followed
 * (for the signed-in uploader only) by their own photos still awaiting review. Tapping a photo
 * opens the fullscreen viewer; with no photos at all it invites the first upload.
 */
export default function FieldGallery({ fieldId, fieldName, initialPhotos }: FieldGalleryProps) {
    const { isSignedIn, getToken } = useAuth();
    const [data, setData] = useState<FieldPhotosResponse | null>(null);
    const [viewerAt, setViewerAt] = useState<number | null>(null);
    const [uploaderOpen, setUploaderOpen] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = isSignedIn ? await getToken() : null;
            setData(await fieldPhotosApi.list(fieldId, token));
        } catch {
            // Keep showing the server-rendered photos; the gallery is not worth an error banner.
        }
    }, [fieldId, getToken, isSignedIn]);

    useEffect(() => {
        // Guests already have everything from the server render.
        if (isSignedIn) void load();
    }, [isSignedIn, load]);

    const slides: Slide[] = useMemo(() => {
        if (!data) return initialPhotos.map((url, i) => ({ id: `ssr-${i}`, url, pending: false }));
        return [
            ...data.photos.map((p) => ({ id: p.id, url: p.url, pending: false })),
            ...data.mine.map((p) => ({ id: p.id, url: p.url, pending: true })),
        ];
    }, [data, initialPhotos]);

    const total = slides.length;
    const { scrollerRef, slideRefs, index, goTo, onKeyDown } = useSnapCarousel(total);

    const removeMine = async (photoId: string) => {
        setRemovingId(photoId);
        try {
            const token = await getToken();
            if (token) await fieldPhotosApi.remove(fieldId, photoId, token);
            await load();
        } catch {
            // Left in place; the user can try again.
        } finally {
            setRemovingId(null);
        }
    };

    const remaining = data?.remaining ?? 0;
    const fieldFull = data?.fieldFull ?? false;
    const canAdd = !!isSignedIn && !!data && !fieldFull && remaining > 0;

    const uploader = isSignedIn && data && (
        <FieldPhotoUploader
            open={uploaderOpen}
            onClose={() => setUploaderOpen(false)}
            fieldId={fieldId}
            fieldName={fieldName}
            remaining={remaining}
            fieldFull={fieldFull}
            onUploaded={load}
        />
    );

    if (total === 0) {
        return (
            <Box
                sx={{
                    position: "relative",
                    height: HEIGHT,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1.5,
                    px: 3,
                    textAlign: "center",
                    color: "#fff",
                    backgroundImage:
                        "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(/images/default-field.jpg)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <PhotoCameraIcon sx={{ fontSize: 40, opacity: 0.9 }} aria-hidden />
                <Typography variant="subtitle1" fontWeight={700}>
                    עדיין אין תמונות של המגרש
                </Typography>
                {isSignedIn ? (
                    <Button
                        variant="contained"
                        startIcon={<AddPhotoIcon />}
                        onClick={() => setUploaderOpen(true)}
                        disabled={!data}
                    >
                        הוסיפו תמונה ראשונה
                    </Button>
                ) : (
                    <Button
                        component={Link}
                        href={`/sign-in?redirect_url=/fields/${fieldId}`}
                        variant="contained"
                        startIcon={<AddPhotoIcon />}
                    >
                        התחברו כדי להוסיף תמונה
                    </Button>
                )}
                {uploader}
            </Box>
        );
    }

    const approved = slides.filter((s) => !s.pending);

    return (
        <Box
            sx={{
                position: "relative",
                height: HEIGHT,
                bgcolor: "action.hover",
                // Arrows stay out of the way until the gallery is hovered or focused; on touch
                // screens they are hidden and swiping does the job.
                "& .gallery-arrow": { opacity: 0, transition: "opacity 150ms ease" },
                "&:hover .gallery-arrow, &:focus-within .gallery-arrow": { opacity: 1 },
                "@media (hover: none)": { "& .gallery-arrow": { display: "none" } },
                "@media (prefers-reduced-motion: reduce)": { "& *": { scrollBehavior: "auto" } },
            }}
        >
            <Box
                ref={scrollerRef}
                tabIndex={0}
                role="region"
                aria-roledescription="carousel"
                aria-label={`תמונות של ${fieldName}`}
                onKeyDown={onKeyDown}
                sx={{
                    ...snapStripSx,
                    height: "100%",
                    "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 },
                }}
            >
                {slides.map((slide, i) => {
                    const label = slide.pending
                        ? `${fieldName} - תמונה שהוספת, ממתינה לאישור`
                        : `${fieldName} - תמונה ${i + 1} מתוך ${approved.length}`;
                    return (
                        <Box
                            key={slide.id}
                            ref={(el: HTMLElement | null) => {
                                slideRefs.current[i] = el;
                            }}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} מתוך ${total}`}
                            sx={{ position: "relative", height: "100%" }}
                        >
                            <ButtonBase
                                onClick={() => setViewerAt(i)}
                                aria-label={`הגדלת התמונה: ${label}`}
                                sx={{
                                    display: "block",
                                    width: "100%",
                                    height: "100%",
                                    position: "relative",
                                    cursor: "zoom-in",
                                    filter: slide.pending ? "saturate(0.6) brightness(0.8)" : "none",
                                    "&.Mui-focusVisible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 },
                                }}
                            >
                                <SlideImage src={fieldPhotoSrc(slide.url, 1200)} alt={label} eager={i === 0} />
                            </ButtonBase>
                            {slide.pending && (
                                <>
                                    <Chip
                                        icon={<HourglassIcon />}
                                        label="ממתינה לאישור"
                                        size="small"
                                        color="warning"
                                        sx={{ position: "absolute", top: 12, insetInlineStart: 12, fontWeight: 700 }}
                                    />
                                    <IconButton
                                        size="small"
                                        onClick={() => removeMine(slide.id)}
                                        disabled={removingId === slide.id}
                                        aria-label="הסרת התמונה שהוספת"
                                        sx={{ ...overlayButtonSx, position: "absolute", bottom: 12, insetInlineStart: 12 }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {isSignedIn && (
                <Button
                    size="small"
                    variant="contained"
                    startIcon={<AddPhotoIcon />}
                    onClick={() => setUploaderOpen(true)}
                    disabled={!canAdd}
                    title={fieldFull ? "הגלריה של המגרש מלאה" : undefined}
                    sx={{
                        ...overlayButtonSx,
                        position: "absolute",
                        top: 12,
                        insetInlineEnd: 12,
                        borderRadius: 999,
                        textTransform: "none",
                        boxShadow: "none",
                    }}
                >
                    הוספת תמונות
                </Button>
            )}

            {total > 1 && (
                <>
                    <IconButton
                        className="gallery-arrow"
                        onClick={() => goTo(index - 1)}
                        disabled={index === 0}
                        aria-label="התמונה הקודמת"
                        sx={{ ...overlayButtonSx, position: "absolute", top: "50%", insetInlineStart: 8, transform: "translateY(-50%)" }}
                    >
                        <ArrowForwardIcon />
                    </IconButton>
                    <IconButton
                        className="gallery-arrow"
                        onClick={() => goTo(index + 1)}
                        disabled={index === total - 1}
                        aria-label="התמונה הבאה"
                        sx={{ ...overlayButtonSx, position: "absolute", top: "50%", insetInlineEnd: 8, transform: "translateY(-50%)" }}
                    >
                        <ArrowBackIcon />
                    </IconButton>

                    {/* Decorative: the counter below carries the same information for assistive tech. */}
                    {total <= MAX_DOTS && (
                        <Box
                            aria-hidden
                            sx={{
                                position: "absolute",
                                bottom: 12,
                                left: "50%",
                                transform: "translateX(-50%)",
                                display: "flex",
                                gap: 0.75,
                                px: 1,
                                py: 0.5,
                                borderRadius: 999,
                                bgcolor: "rgba(0,0,0,0.35)",
                            }}
                        >
                            {slides.map((s, i) => (
                                <Box
                                    key={s.id}
                                    sx={{
                                        width: i === index ? 16 : 6,
                                        height: 6,
                                        borderRadius: 999,
                                        bgcolor: i === index ? "#fff" : "rgba(255,255,255,0.55)",
                                        transition: "width 200ms ease, background-color 200ms ease",
                                    }}
                                />
                            ))}
                        </Box>
                    )}
                    <Typography
                        variant="caption"
                        aria-live="polite"
                        sx={{
                            position: "absolute",
                            bottom: 12,
                            insetInlineEnd: 12,
                            px: 1,
                            py: 0.25,
                            borderRadius: 999,
                            bgcolor: "rgba(0,0,0,0.5)",
                            color: "#fff",
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                            {`תמונה ${index + 1} מתוך ${total}`}
                        </Box>
                        <span dir="ltr" aria-hidden>{`${index + 1} / ${total}`}</span>
                    </Typography>
                </>
            )}

            <FieldPhotoViewer
                open={viewerAt !== null}
                onClose={() => setViewerAt(null)}
                fieldName={fieldName}
                photos={slides}
                startIndex={viewerAt ?? 0}
            />
            {uploader}
        </Box>
    );
}
