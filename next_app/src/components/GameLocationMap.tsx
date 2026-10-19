"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, InfoWindow, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Single green pin for the game/field location, managed imperatively instead of via
// <AdvancedMarker><Pin/></AdvancedMarker> (JOINUP-WEB-2).
//
// Why: @vis.gl's <Pin> re-runs its effect on every render (its deps include the `props`
// object, which is new each render) and each run builds a fresh PinElement and swaps it
// into the marker's content node by removing the previous one. Combined with React
// StrictMode's mount/unmount/remount and any re-render of this component (InfoWindow
// toggle, parent state), Google's marker renderer could be left with a pending
// requestAnimationFrame update for a PinElement/marker whose DOM had already been torn
// out from under it -> `Cannot read properties of undefined (reading 'getRootNode')`
// inside maps-api-v3 marker.js.
//
// Here the marker and its PinElement are created exactly once per (map, marker library,
// coordinates), only after both exist, its content is never mutated afterwards, and the
// effect cleanup detaches it from the map (`marker.map = null`) and drops the click
// listener, so nothing outlives the component or the map instance.
function GameLocationMarker({
  lat,
  lng,
  onClick,
}: {
  lat: number;
  lng: number;
  onClick: () => void;
}) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");

  // Latest click handler without making it an effect dependency (that would recreate
  // the marker on every render, i.e. the very churn this component exists to avoid).
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    // The map instance / marker library load asynchronously; never construct a marker
    // against a map that isn't there yet.
    if (!map || !markerLib) return;

    const pin = new markerLib.PinElement({
      background: "#059669",
      borderColor: "#047857",
      glyphColor: "#fff",
    });
    const marker = new markerLib.AdvancedMarkerElement({
      map,
      position: { lat, lng },
      // PinElement is itself the <gmp-pin> element (`.element` is deprecated).
      content: pin,
      gmpClickable: true,
    });
    const handleClick = () => onClickRef.current();
    marker.addEventListener("gmp-click", handleClick);

    return () => {
      marker.removeEventListener("gmp-click", handleClick);
      marker.map = null;
    };
  }, [map, markerLib, lat, lng]);

  return null;
}

export default function GameLocationMap({
  lat,
  lng,
  title,
  height = 240,
}: {
  lat: number;
  lng: number;
  title?: string;
  height?: number;
}) {
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!GOOGLE_MAPS_API_KEY) {
    return <div style={{ color: "#64748b", fontSize: 14 }}>מפה לא זמינה כרגע.</div>;
  }

  return (
    <div style={{ width: "100%", height }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="he" region="IL" libraries={["marker"]}>
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          defaultZoom={16}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <GameLocationMarker lat={lat} lng={lng} onClick={() => setInfoOpen(true)} />
          {infoOpen && (
            <InfoWindow position={center} onCloseClick={() => setInfoOpen(false)}>
              {title || "מיקום המשחק"}
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
