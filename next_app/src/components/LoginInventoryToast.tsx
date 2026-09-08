"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

/**
 * Fires once when a guest becomes signed-in in this tab, then restores scroll
 * so newly revealed private/group rails don't yank the viewport.
 */
export default function LoginInventoryToast() {
  const { isLoaded, isSignedIn } = useAuth();
  const prevSignedIn = useRef<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    const signedIn = !!isSignedIn;
    if (prevSignedIn.current === false && signedIn) {
      const y = typeof window !== "undefined" ? window.scrollY : 0;
      setOpen(true);
      const restore = () => {
        if (typeof window !== "undefined") window.scrollTo({ top: y, behavior: "auto" });
      };
      restore();
      requestAnimationFrame(restore);
      const t = window.setTimeout(restore, 80);
      prevSignedIn.current = signedIn;
      return () => window.clearTimeout(t);
    }
    prevSignedIn.current = signedIn;
  }, [isLoaded, isSignedIn]);

  return (
    <Snackbar
      open={open}
      autoHideDuration={4500}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={() => setOpen(false)} severity="success" variant="filled" sx={{ width: "100%" }}>
        התחברת בהצלחה — מציגים משחקים נוספים עבורך
      </Alert>
    </Snackbar>
  );
}
