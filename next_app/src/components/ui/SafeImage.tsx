"use client";
import React, { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  alt: string;
  /** Rendered instead of the image when src is empty or fails to load. Defaults to a neutral box. */
  fallback?: React.ReactNode;
};

/**
 * <img> that never shows a broken-image icon. On a load error it swaps to `fallback` (or a neutral
 * placeholder that keeps className/style, so layout doesn't shift). No retries until `src` changes.
 * Stored /uploads/... URLs can point at files that no longer exist. Also catches images that already
 * failed before hydration (the error event fired before React attached onError).
 */
const SafeImage = forwardRef<HTMLImageElement, SafeImageProps>(function SafeImage(
  { src, alt, fallback, className, style, ...rest },
  forwardedRef,
) {
  // Compared against the current url, so a new src is automatically "not failed" again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const url = src && src.trim().length > 0 ? src : null;

  const setRefs = useCallback(
    (node: HTMLImageElement | null) => {
      imgRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (url && img && img.complete && img.naturalWidth === 0) setFailedSrc(url);
  }, [url]);

  if (!url || failedSrc === url) {
    if (fallback !== undefined) return <>{fallback}</>;
    const decorative = !alt;
    return (
      <span
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": alt })}
        className={`${className ?? ""} bg-gray-200 dark:bg-gray-700`.trim()}
        style={{ display: "inline-block", ...style }}
      />
    );
  }

  return <img {...rest} ref={setRefs} src={url} alt={alt} className={className} style={style} onError={() => setFailedSrc(url)} />;
});

export default SafeImage;
