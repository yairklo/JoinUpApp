"use client";
import React from "react";

function buildMapLinks(lat: number, lng: number, label?: string) {
  const encLabel = encodeURIComponent(label || "Destination");
  return {
    wazeApp: `waze://?ll=${lat},${lng}&navigate=yes`,
    wazeWeb: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    gmapsApp: `google.navigation:q=${lat},${lng}`,
    gmapsWeb: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    appleApp: `maps://?daddr=${lat},${lng}&q=${encLabel}`,
    appleWeb: `https://maps.apple.com/?daddr=${lat},${lng}&q=${encLabel}`,
  };
}

function tryOpenAppThenWeb(appUrl: string, webUrl: string) {
  try {
    const now = Date.now();
    // Attempt to open the app via URL scheme
    window.location.href = appUrl;
    // If the browser stays visible after a short delay, fall back to web
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = webUrl;
      }
    }, 1200);
  } catch {
    window.location.href = webUrl;
  }
}

export default function GameActions({
  gameId,
  fieldName,
  lat,
  lng,
}: {
  gameId: string;
  fieldName?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const isLoc = typeof lat === "number" && typeof lng === "number";
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  const gameUrl = origin ? `${origin}/games/${gameId}` : `/games/${gameId}`;

  const shareText = `${fieldName ? `${fieldName} – ` : ""}Join this game: ${gameUrl}`;

  // Single Share button: show native share sheet when available;
  // If the user cancels, do nothing. If not supported, copy to clipboard.
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText, url: gameUrl });
        return;
      } catch (err: any) {
        // If the user closed/cancelled the sheet, do nothing and do not fallback to web
        const name = err?.name || "";
        if (name === "AbortError" || name === "NotAllowedError") {
          return;
        }
        // Other errors: continue to clipboard fallback
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      alert("Link copied to clipboard");
    } catch {
      // last resort: open a simple WhatsApp web share
      const web = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(web, "_blank");
    }
  };

  // Single Navigate button: use a generic Google Maps URL to trigger OS intent/chooser
  const navigateToDest = () => {
    if (!isLoc) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, "_blank");
  };

  return (
    <section className="mb-4">
      <div className="d-flex flex-wrap align-items-center gap-2">
        {isLoc ? (
          <a className="btn btn-outline-primary btn-sm" href="#game-map">
            View on map
          </a>
        ) : null}

        {isLoc ? (
          <button className="btn btn-light btn-sm" onClick={navigateToDest}>
            Navigate
          </button>
        ) : null}

        <button className="btn btn-secondary btn-sm" onClick={share}>
          Share
        </button>
      </div>
    </section>
  );
}


