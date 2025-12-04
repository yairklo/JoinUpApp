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

  const openWhatsApp = () => {
    const app = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
    const web = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    tryOpenAppThenWeb(app, web);
  };
  const openTelegram = () => {
    const app = `tg://msg_url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(
      fieldName || "Join this game"
    )}`;
    const web = `https://t.me/share/url?url=${encodeURIComponent(
      gameUrl
    )}&text=${encodeURIComponent(fieldName || "Join this game")}`;
    tryOpenAppThenWeb(app, web);
  };

  const doWebShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText, url: gameUrl });
        return;
      } catch {
        // fall back to WhatsApp web if user cancels or not supported
      }
    }
    openWhatsApp();
  };

  const links = isLoc ? buildDirLinks() : null;

  function buildDirLinks() {
    const l = buildMapLinks(lat as number, lng as number, fieldName);
    return [
      { label: "Waze", app: l.wazeApp, web: l.wazeWeb },
      { label: "Google Maps", app: l.gmapsApp, web: l.gmapsWeb },
      { label: "Apple Maps", app: l.appleApp, web: l.appleWeb },
    ];
  }

  return (
    <section className="mb-4">
      <div className="d-flex flex-wrap align-items-center gap-2">
        {isLoc ? (
          <a className="btn btn-outline-primary btn-sm" href="#game-map">
            View on map
          </a>
        ) : null}

        {isLoc && links
          ? links.map((l) => (
              <button
                key={l.label}
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => tryOpenAppThenWeb(l.app, l.web)}
              >
                {l.label}
              </button>
            ))
          : null}

        <button className="btn btn-secondary btn-sm" onClick={doWebShare}>
          Share
        </button>
        <button className="btn btn-success btn-sm" onClick={openWhatsApp}>
          WhatsApp
        </button>
        <button className="btn btn-info btn-sm" onClick={openTelegram}>
          Telegram
        </button>
      </div>
    </section>
  );
}


