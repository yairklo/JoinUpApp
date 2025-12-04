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

  // Single Share button: show native share sheet when available, fallback to WhatsApp web
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText, url: gameUrl });
        return;
      } catch {
        // user cancelled or not available -> fallback below
      }
    }
    const web = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    // On mobile without Web Share API, try opening the native WhatsApp app first.
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const app = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
      tryOpenAppThenWeb(app, web);
    } else {
      window.open(web, "_blank");
    }
  };

  // Single Navigate button: prefer Waze app, fallback to Waze web (which in turn offers open in app or maps)
  const navigateToDest = () => {
    if (!isLoc) return;
    const { wazeApp, wazeWeb } = buildMapLinks(lat as number, lng as number, fieldName);
    tryOpenAppThenWeb(wazeApp, wazeWeb);
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


