"use client";

import { useEffect, useRef, useState } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

/**
 * Global offline/online feedback -- mounted once in layout.tsx (unlike
 * LoginInventoryToast, which is page-scoped, this needs to be reachable from
 * every route). Follows the same Snackbar/Alert + "only react to an actual
 * transition" convention as LoginInventoryToast.tsx: a persistent warning
 * while offline (doesn't auto-hide -- the user needs to know until it's
 * resolved), then a brief confirmation once the connection returns.
 */
export default function OfflineStatusToast() {
  const [isOffline, setIsOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      setIsOffline(true);
      setShowBackOnline(false);
    };
    const handleOnline = () => {
      if (wasOffline.current) {
        setShowBackOnline(true);
      }
      wasOffline.current = false;
      setIsOffline(false);
    };

    // Reflect the actual state at mount time too (e.g. a hard reload while
    // already offline), not just future transitions.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      wasOffline.current = true;
      setIsOffline(true);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <>
      <Snackbar
        open={isOffline}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        // No autoHideDuration -- stays up for as long as the connection is
        // actually down, closes itself the moment "online" fires.
      >
        <Alert severity="warning" variant="filled" sx={{ width: "100%" }}>
          אין חיבור לאינטרנט — חלק מהמידע עשוי להיות לא מעודכן
        </Alert>
      </Snackbar>

      <Snackbar
        open={showBackOnline}
        autoHideDuration={3000}
        onClose={() => setShowBackOnline(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setShowBackOnline(false)} severity="success" variant="filled" sx={{ width: "100%" }}>
          החיבור לאינטרנט חזר
        </Alert>
      </Snackbar>
    </>
  );
}
