"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, LayersControl, MapContainer, Polyline, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { ROUTE_COLORS, type LatLng, type SimulationResult } from "@/lib/api";

export const TIMELAPSE = 60; // vehicle animation: 1 simulated minute = 1 real second
export const MAX_DOTS = 150;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Me = { lat: number; lng: number; accuracy: number };

type Props = {
  origin: LatLng;
  destination: LatLng;
  onPick: (p: LatLng) => void;
  result: SimulationResult | null;
  view: "baseline" | "optimized";
  showVehicles: boolean;
  me: Me | null;
  follow: boolean;
};

function ClickPicker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitToRoutes({ result }: { result: SimulationResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (!result) return;
    // fitBounds, not flyToBounds: the canvas renderer goes stale when layers change mid-flight.
    map.fitBounds(L.latLngBounds(result.routes.flatMap((r) => r.coords)), { padding: [56, 56], animate: !reduceMotion() });
  }, [map, result]);
  return null;
}

function FollowMe({ me, follow }: { me: Me | null; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (me && follow) map.panTo([me.lat, me.lng], { animate: true });
  }, [map, me, follow]);
  return null;
}

/** Dots moving along each route, count proportional to its allocation, speed from the route's BPR travel time. */
function Vehicles({ result, view }: { result: SimulationResult; view: "baseline" | "optimized" }) {
  const map = useMap();
  useEffect(() => {
    const ev = result[view];
    const Q = ev.allocation.reduce((a, b) => a + b, 0);
    if (!Q) return;
    const perDot = Math.max(1, Q / MAX_DOTS);
    const dots: { pts: L.LatLng[]; cum: number[]; loop: number; phase: number; m: L.CircleMarker }[] = [];
    result.routes.forEach((r, i) => {
      const n = Math.round(ev.allocation[i] / perDot);
      if (!n) return;
      const pts = r.coords.map(([a, b]) => L.latLng(a, b));
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k - 1].distanceTo(pts[k]));
      const loop = Math.max(2, (ev.route_travel_time_min[i] * 60) / TIMELAPSE);
      for (let j = 0; j < n; j++) {
        const m = L.circleMarker(pts[0], { radius: 2.5, stroke: false, fillColor: "#fff", fillOpacity: 0.95, interactive: false }).addTo(map);
        dots.push({ pts, cum, loop, phase: j / n, m });
      }
    });
    // ponytail: uniform speed along a route; per-edge BPR speeds would show slowdowns at bottlenecks.
    const at = (d: (typeof dots)[number], f: number) => {
      const s = f * d.cum[d.cum.length - 1];
      let lo = 0, hi = d.cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d.cum[mid] <= s) lo = mid; else hi = mid; }
      const seg = d.cum[hi] - d.cum[lo] || 1, t = (s - d.cum[lo]) / seg, a = d.pts[lo], b = d.pts[hi];
      return L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
    };
    let raf = 0;
    if (reduceMotion()) {
      dots.forEach((d) => d.m.setLatLng(at(d, d.phase))); // still show where traffic is, without motion
    } else {
      const start = performance.now();
      const tick = (now: number) => {
        const t = (now - start) / 1000;
        for (const d of dots) d.m.setLatLng(at(d, (t / d.loop + d.phase) % 1));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); dots.forEach((d) => d.m.remove()); };
  }, [map, result, view]);
  return null;
}

export default function RouteMap(p: Props) {
  const { result, view } = p;
  const ev = result?.[view];
  const Q = ev ? ev.allocation.reduce((a, b) => a + b, 0) : 0;
  return (
    <MapContainer center={[23.25, 77.42]} zoom={13} preferCanvas zoomControl={false} className="h-full w-full" aria-label="Bhopal road map">
      <LayersControl position="bottomright">
        <LayersControl.BaseLayer checked name="Streets">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer attribution="Tiles &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
        </LayersControl.BaseLayer>
      </LayersControl>
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />
      <ClickPicker onPick={p.onPick} />
      <FitToRoutes result={result} />
      <FollowMe me={p.me} follow={p.follow} />

      {result?.routes.map((r, i) => {
        const n = ev!.allocation[i];
        const w = n ? 4 + 8 * (n / Q) : 3;
        return [
          <Polyline key={`${view}-c${i}`} positions={r.coords} interactive={false} pathOptions={{ color: "#fff", weight: w + 3, opacity: n ? 0.35 : 0.2 }} />,
          <Polyline key={`${view}-${i}`} positions={r.coords}
            pathOptions={{ color: ROUTE_COLORS[i], weight: w, opacity: n ? 0.9 : 0.5, dashArray: n ? undefined : "6 8" }}>
            <Tooltip sticky>{r.name} · {n} veh/h · {ev!.route_travel_time_min[i].toFixed(1)} min</Tooltip>
          </Polyline>,
        ];
      })}

      {result && p.showVehicles && <Vehicles result={result} view={view} />}

      {result?.scenario.closed_roads.map((c, i) => (
        <Polyline key={`closed-${i}`} positions={c.coords} pathOptions={{ color: "#dc2626", weight: 5, dashArray: "1 10", lineCap: "round" }}>
          <Tooltip sticky>Closed: {[c.name].flat().join(" / ")}</Tooltip>
        </Polyline>
      ))}

      {p.me && (
        <>
          <Circle center={[p.me.lat, p.me.lng]} radius={p.me.accuracy} interactive={false} pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.1 }} />
          <CircleMarker center={[p.me.lat, p.me.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
            <Tooltip direction="top">You are here (±{Math.round(p.me.accuracy)} m)</Tooltip>
          </CircleMarker>
        </>
      )}

      <CircleMarker center={[p.origin.lat, p.origin.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#18181b", fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>Start</Tooltip>
      </CircleMarker>
      <CircleMarker center={[p.destination.lat, p.destination.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>Destination</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
