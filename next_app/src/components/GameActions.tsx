"use client";
import React, { useState } from "react";
import GameLocationMap from "@/components/GameLocationMap";

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
  const [mapOpen, setMapOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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
          <button className="btn btn-outline-primary btn-sm" onClick={() => setMapOpen(true)}>
            View on map
          </button>
        ) : null}

        {isLoc ? (
          <button className="btn btn-light btn-sm" onClick={() => setNavOpen(true)}>
            Navigate
          </button>
        ) : null}

        <button className="btn btn-secondary btn-sm" onClick={share}>
          Share
        </button>
      </div>

      {/* Map modal */}
      {isLoc && mapOpen ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.45)", zIndex: 1050 }}
          onClick={() => setMapOpen(false)}
        >
          <div
            className="position-absolute bg-white rounded shadow"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(92vw, 720px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center justify-content-between border-bottom p-2">
              <div className="fw-semibold">{fieldName || "Game location"}</div>
              <button className="btn btn-sm btn-light" onClick={() => setMapOpen(false)}>
                Close
              </button>
            </div>
            <div className="p-2">
              <GameLocationMap lat={lat as number} lng={lng as number} title={fieldName} height={360} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Navigation chooser modal */}
      {isLoc && navOpen ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.45)", zIndex: 1050 }}
          onClick={() => setNavOpen(false)}
        >
          <div
            className="position-absolute bg-white rounded shadow"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(92vw, 520px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center justify-content-between border-bottom p-2">
              <div className="fw-semibold">Open directions in…</div>
              <button className="btn btn-sm btn-light" onClick={() => setNavOpen(false)}>
                Close
              </button>
            </div>
            <div className="p-3 d-flex flex-column gap-2">
              {(() => {
                const l = buildMapLinks(lat as number, lng as number, fieldName);
                return (
                  <>
                    <button
                      className="btn btn-light text-start"
                      onClick={() => tryOpenAppThenWeb(l.wazeApp, l.wazeWeb)}
                    >
                      Waze
                    </button>
                    <button
                      className="btn btn-light text-start"
                      onClick={() => tryOpenAppThenWeb(l.gmapsApp, l.gmapsWeb)}
                    >
                      Google Maps
                    </button>
                    <button
                      className="btn btn-light text-start"
                      onClick={() => tryOpenAppThenWeb(l.appleApp, l.appleWeb)}
                    >
                      Apple Maps
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


