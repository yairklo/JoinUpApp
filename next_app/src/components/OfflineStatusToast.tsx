"use client";

import { useEffect, useRef, useState } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { useSocket } from "@/context/SocketContext";

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
  // "online" only means the network interface is up. When the app keeps a realtime socket, wait for it
  // to actually reconnect before announcing that the connection is back.
  const [awaitingSocket, setAwaitingSocket] = useState(false);
  const { socket, isConnected } = useSocket();
  const hasSocketRef = useRef(false);
  hasSocketRef.current = !!socket;
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      setIsOffline(true);
      setShowBackOnline(false);
    };
    const handleOnline = () => {
      if (wasOffline.current) {
        if (hasSocketRef.current) setAwaitingSocket(true);
        else setShowBackOnline(true);
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

  useEffect(() => {
    if (awaitingSocket && isConnected) {
      setAwaitingSocket(false);
      setShowBackOnline(true);
    }
  }, [awaitingSocket, isConnected]);

  // The socket may drop and come back without a matching browser offline/online event pair
  // (proxy drops, ping timeouts, missed events): announce any real socket reconnect too.
  const wasConnectedRef = useRef(false);
  const socketDroppedRef = useRef(false);
  useEffect(() => {
    if (isConnected) {
      if (socketDroppedRef.current) {
        socketDroppedRef.current = false;
        setAwaitingSocket(false);
        setShowBackOnline(true);
      }
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current) {
      socketDroppedRef.current = true;
    }
  }, [isConnected]);

  // Network is back but the socket is slow/stuck: do not leave the user without confirmation.
  useEffect(() => {
    if (!awaitingSocket) return;
    const t = setTimeout(() => {
      setAwaitingSocket(false);
      setShowBackOnline(true);
    }, 10000);
    return () => clearTimeout(t);
  }, [awaitingSocket]);

  // Offline again before the socket came back: forget the pending announcement.
  useEffect(() => {
    if (isOffline) setAwaitingSocket(false);
  }, [isOffline]);

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
        onClose={(_, reason) => {
          // A stray click elsewhere must not dismiss the confirmation before its ~3s are up.
          if (reason === "clickaway") return;
          setShowBackOnline(false);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setShowBackOnline(false)} severity="success" variant="filled" sx={{ width: "100%" }}>
          החיבור לאינטרנט חזר
        </Alert>
      </Snackbar>
    </>
  );
}
