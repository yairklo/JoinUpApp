"use client";
import React, { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  alt: string;
  /** Rendered instead of the image when src is empty or fails to load. Defaults to a neutral box. */
  fallback?: React.ReactNode;
};

/**
 * <img> that never shows a broken-image icon. On the first load error it swaps to `fallback`
 * (or a neutral placeholder that keeps className/style, so layout doesn't shift). It does not retry
 * until `src` changes. Stored /uploads/... URLs can point at files that no longer exist.
 */
export default function SafeImage({ src, alt, fallback, className, style, ...rest }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = src && src.trim().length > 0 ? src : null;

  useEffect(() => {
    setFailedSrc(null);
  }, [url]);

  if (!url || failedSrc === url) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <span
        role="img"
        aria-label={alt}
        className={className}
        style={{ display: "inline-block", background: "#e5e7eb", ...style }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...rest} src={url} alt={alt} className={className} style={style} onError={() => setFailedSrc(url)} />
  );
}
