"use client";

import { useCallback, useRef, useState } from "react";
import { tryNativeShare } from "@/utils/share";

export type CopyState = "idle" | "copied" | "failed";

/**
 * Copy-a-link dialog shared by GameActions and SeriesMembersPanel: tries the native share sheet
 * on touch devices, otherwise opens a dialog with the link, auto-copies it, and reports the
 * result. `copyLink` is safe to call concurrently (the dialog auto-copies on open, and the user
 * can also click "copy" by hand) — a sequence number ensures only the most recent call's outcome
 * is ever applied, so an in-flight auto-copy can never clobber a later manual click or vice versa.
 */
export function useShareDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const seq = useRef(0);

  const copyLink = useCallback(async (link: string) => {
    const mySeq = ++seq.current;
    try {
      await navigator.clipboard.writeText(link);
      if (seq.current === mySeq) setCopyState("copied");
    } catch {
      if (seq.current === mySeq) setCopyState("failed");
    }
  }, []);

  const share = useCallback(
    async ({ title, text, url: shareUrl }: { title?: string; text: string; url: string }) => {
      if (await tryNativeShare({ title, text, url: shareUrl })) return;
      setUrl(shareUrl);
      setCopyState("idle");
      setOpen(true);
      // The click that triggered `share` is the user gesture, so copying right away is allowed.
      void copyLink(shareUrl);
    },
    [copyLink]
  );

  return { open, setOpen, url, copyState, copyLink, share };
}
