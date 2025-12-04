"use client";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

type FieldPoint = {
  id: string;
  name: string;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

// Use CDN icons to avoid bundling issues
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type MapComponentProps = {
  onSelect?: (field: { id: string; name: string; location?: string | null }) => void;
};

export default function MapComponent({ onSelect }: MapComponentProps) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [fields, setFields] = useState<FieldPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function run() {
      try {
        const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
        const arr = (await res.json()) as any[];
        if (!ignore) {
          setFields(
            arr.map((f) => ({
              id: f.id,
              name: f.name,
              location: f.location,
              lat: typeof f.lat === "number" ? f.lat : undefined,
              lng: typeof f.lng === "number" ? f.lng : undefined,
            }))
          );
        }
      } catch {
        if (!ignore) setFields([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, []);

  // Get user geolocation (fallback Tel Aviv)
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation([32.0853, 34.7818]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setUserLocation([32.0853, 34.7818]);
      }
    );
  }, []);

  const fieldMarkers = useMemo(
    () => fields.filter((f) => typeof f.lat === "number" && typeof f.lng === "number") as Required<FieldPoint>[],
    [fields]
  );

  if (!userLocation) return <div className="text-muted">Loading map…</div>;

  return (
    <div style={{ width: "100%", height: 450 }}>
      <MapContainer center={userLocation} zoom={13} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={userLocation} icon={defaultIcon}>
          <Popup>You are here</Popup>
        </Marker>
        <ClusteredFieldMarkers points={fieldMarkers} onSelect={onSelect} />
      </MapContainer>
      {loading ? <div className="text-muted small mt-2">Loading fields…</div> : null}
      {!loading && fieldMarkers.length === 0 ? (
        <div className="text-muted small mt-2">No fields with coordinates to display.</div>
      ) : null}
    </div>
  );
}

function ClusteredFieldMarkers({
  points,
  onSelect,
}: {
  points: Required<FieldPoint>[];
  onSelect?: (field: { id: string; name: string; location?: string | null }) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  // Track zoom/move to recompute clusters
  useMapEvents({
    zoomend() {
      setZoom(map.getZoom());
    },
    moveend() {
      // Recompute using the same zoom after panning (affects pixel buckets)
      setZoom(map.getZoom());
    },
  });

  const clusters = useMemo(() => {
    // Grid-based clustering in pixel space; tuned for performance/clarity
    const z = Math.round(zoom || 13);
    const gridSizePx = 60; // cluster bucket size in screen pixels
    const buckets = new Map<
      string,
      { sumLat: number; sumLng: number; items: Required<FieldPoint>[] }
    >();

    for (const p of points) {
      const projected = map.project(L.latLng(p.lat, p.lng), z);
      const key = `${Math.floor(projected.x / gridSizePx)}:${Math.floor(projected.y / gridSizePx)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { sumLat: 0, sumLng: 0, items: [] };
        buckets.set(key, bucket);
      }
      bucket.sumLat += p.lat;
      bucket.sumLng += p.lng;
      bucket.items.push(p);
    }

    return Array.from(buckets.values()).map((b) => ({
      lat: b.sumLat / b.items.length,
      lng: b.sumLng / b.items.length,
      items: b.items,
    }));
  }, [points, zoom, map]);

  return (
    <>
      {clusters.map((c, idx) => {
        if (c.items.length === 1) {
          const f = c.items[0];
          return (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={defaultIcon}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{f.location || ""}</div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onSelect?.({ id: f.id, name: f.name, location: f.location })}
                    >
                      בחר מגרש זה
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        }

        // Cluster marker
        const count = c.items.length;
        const icon = L.divIcon({
          html: clusterHtml(count),
          className: "cluster-marker",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        return (
          <Marker
            key={`cluster-${idx}`}
            position={[c.lat, c.lng]}
            icon={icon}
            eventHandlers={{
              click: () => {
                // Smoothly zoom in towards the cluster
                const targetZoom = Math.min((map.getMaxZoom() || 18), map.getZoom() + 2);
                map.flyTo([c.lat, c.lng], targetZoom, { duration: 0.6 });
              },
            }}
          />
        );
      })}
    </>
  );
}

function clusterHtml(count: number) {
  // Simple responsive cluster appearance
  const size = count > 100 ? 44 : count > 25 ? 40 : 36;
  const bg = count > 100 ? "#d32f2f" : count > 25 ? "#f57c00" : "#1976d2";
  const shadow = "0 0 0 4px rgba(25, 118, 210, 0.15)";
  return `<div style="
    width:${size}px;
    height:${size}px;
    border-radius:50%;
    background:${bg};
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight:700;
    box-shadow:${shadow};
    font-size:13px;
  ">${count}</div>`;
}


