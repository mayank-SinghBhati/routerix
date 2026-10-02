// Types mirror backend/simulate.py run_routerix_simulation() and backend/accounts.py.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type LatLng = { lat: number; lng: number };
export type Scenario = "live" | "normal" | "peak" | "high_demand" | "road_closure";
export type Coords = [number, number][];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  live: "Live traffic",
  normal: "Normal traffic",
  peak: "Peak hours",
  high_demand: "High demand",
  road_closure: "Road closure",
};

export type Evaluation = {
  algorithm: string;
  allocation: number[];
  total_network_travel_time_veh_h: number;
  average_travel_time_min: number;
  route_travel_time_min: number[];
  total_distance_veh_km: number;
  congested_edges: number;
  max_vc: number;
  edge_vc: number[];
  status_labels?: string[];
};

export type ClosedRoad = { coords: Coords; name?: string | string[] | null; source: "user" | "scenario" | "here_live" };

export type SimulationResult = {
  trip_id?: number;
  request: {
    origin: [number, number]; destination: [number, number]; origin_label?: string; destination_label?: string;
    vehicles: number; k_routes: number; scenario: Scenario; closures: [number, number][];
  };
  scenario: { name: Scenario; background_vc: number; demand_factor: number; effective_demand_veh_h: number; closed_roads: ClosedRoad[] };
  traffic: { source: "model" | "here_live"; provider: string; updated?: string; candidate_edges: number; candidate_edges_live: number; osm_edges_matched?: number };
  assumptions: Record<string, unknown>;
  routes: { id: number; name?: string; via?: string; coords: Coords; length_km: number; capacity?: number; free_flow_min: number }[];
  edges: Coords[];
  edge_live: boolean[];
  baseline: Evaluation;
  optimized: Evaluation;
  comparison: { travel_time_improvement_percent: number; average_travel_time_improvement_percent: number; congested_edges: [number, number] };
  optimization: { algorithm: string; best_fitness: number; convergence: number[]; iterations: number; particles: number; runtime_ms: number };
};

export type User = { id: number; email: string; name: string; created_at: string; last_login_at: string | null };

export type Trip = {
  id: number; created_at: string; origin_label: string; destination_label: string;
  origin_lat: number; origin_lng: number; destination_lat: number; destination_lng: number;
  scenario: Scenario; vehicles: number; k_routes: number; traffic_source: string;
  baseline_veh_h: number; optimized_veh_h: number; baseline_avg_min: number; optimized_avg_min: number;
  improvement_pct: number; avg_improvement_pct: number; shortest_km: number;
};

export type Stats = {
  trips: number; vehicles_routed: number; veh_hours_saved: number;
  avg_network_improvement_pct: number | null; avg_trip_improvement_pct: number | null; best_trip_improvement_pct: number | null;
  last_trip_at: string | null;
  by_scenario: { scenario: Scenario; trips: number; avg_trip_improvement_pct: number }[];
  by_day: { day: string; trips: number }[];
};

export type Config = { live_traffic: boolean; email: boolean; scenarios: Scenario[] };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// All calls go through the Next.js rewrite in next.config.ts, so the session cookie is same-origin.
async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.json !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running on :8000?", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e.msg).join("; ") : res.status >= 500 ? "Server error. Is the API running on :8000?" : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const auth = {
  signup: (name: string, email: string, password: string) => api<User>("/auth/signup", { method: "POST", json: { name, email, password } }),
  login: (email: string, password: string) => api<User>("/auth/login", { method: "POST", json: { email, password } }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  forgot: (email: string) => api<{ message: string }>("/auth/forgot", { method: "POST", json: { email } }),
  reset: (token: string, password: string) => api<{ message: string }>("/auth/reset", { method: "POST", json: { token, password } }),
  me: () => api<User>("/me"),
  updateMe: (body: { name?: string; email?: string; current_password?: string }) => api<User>("/me", { method: "PATCH", json: body }),
  changePassword: (current_password: string, new_password: string) => api<void>("/me/password", { method: "POST", json: { current_password, new_password } }),
};

export const getConfig = () => api<Config>("/config");
export const listTrips = (limit = 100) => api<Trip[]>(`/trips?limit=${limit}`);
export const getTrip = (id: number) => api<SimulationResult>(`/trips/${id}`);
export const deleteTrip = (id: number) => api<void>(`/trips/${id}`, { method: "DELETE" });
export const getStats = () => api<Stats>("/stats");

export const simulate = (body: {
  origin: LatLng; destination: LatLng; origin_label: string; destination_label: string;
  vehicles: number; k_routes: number; scenario: Scenario; closures: LatLng[];
}) => api<SimulationResult>("/simulate", { method: "POST", json: body });

/** Signed-in user, or redirect to /login. */
export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    auth.me().then(setUser, (e) => { if (e instanceof ApiError && e.status === 401) router.replace("/login"); });
  }, [router]);
  return [user, setUser] as const;
}

// Nominatim (OSM) geocoding, bounded to Bhopal. Usage policy: max 1 request/s, which user-driven calls stay under.
const NOMINATIM = "https://nominatim.openstreetmap.org";

export type LocationSuggestion = {
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
};

export const BHOPAL_LANDMARKS: LocationSuggestion[] = [
  { name: "MP Nagar Zone 1", category: "Commercial Hub", lat: 23.2332, lng: 77.4343, description: "Major business center & transit node" },
  { name: "Bhopal Junction Railway Station", category: "Transit Station", lat: 23.2665, lng: 77.4136, description: "Main railway hub · Platform 1" },
  { name: "Rani Kamlapati Station (Habibganj)", category: "Transit Station", lat: 23.2225, lng: 77.4388, description: "World-class redeveloped terminal" },
  { name: "New Market / TT Nagar", category: "Shopping & Civic", lat: 23.2368, lng: 77.4018, description: "Central retail & administrative area" },
  { name: "DB City Mall / Board Office", category: "Landmark Mall", lat: 23.2330, lng: 77.4275, description: "Arera Hills · Hoshangabad Link" },
  { name: "Lalghati Square", category: "Major Intersection", lat: 23.2745, lng: 77.3765, description: "Airport & NH-46 gateway" },
  { name: "AIIMS Bhopal / Saket Nagar", category: "Healthcare", lat: 23.2295, lng: 77.4575, description: "Premier medical research institute" },
  { name: "VIP Road Lake View", category: "Scenic Arterial", lat: 23.2610, lng: 77.3795, description: "Upper Lake waterfront corridor" },
  { name: "Shahpura Lake / Trilanga", category: "Waterfront & Civic", lat: 23.2045, lng: 77.4255, description: "South Bhopal arterial node" },
  { name: "MANIT Bhopal / Link Road 3", category: "Academic Campus", lat: 23.2185, lng: 77.4155, description: "National Institute of Technology" },
  { name: "Vallabh Bhawan / Arera Hills", category: "Government", lat: 23.2465, lng: 77.4220, description: "State government secretariat" },
  { name: "Hamidia Road / Nadra Bus Stand", category: "Bus Terminal", lat: 23.2640, lng: 77.4015, description: "Old city transportation nexus" },
  { name: "Kolar Road / Chuna Bhatti", category: "Residential Corridor", lat: 23.1965, lng: 77.4135, description: "Fast-growing southwestern corridor" },
  { name: "Bairagarh (Sant Hirdaram Nagar)", category: "Western Suburb", lat: 23.2715, lng: 77.3425, description: "Major commercial & textile market" },
  { name: "Indrapuri / BHEL Gate", category: "Industrial Belt", lat: 23.2515, lng: 77.4720, description: "Eastern industrial belt & college hub" },
  { name: "Karond Square / Bypass", category: "Northern Gateway", lat: 23.2910, lng: 77.4155, description: "Berasia Road & Mandi junction" },
  { name: "Ayodhya Bypass / ISBT Link", category: "Ring Road", lat: 23.2680, lng: 77.4685, description: "Heavy vehicle & bypass transit" },
  { name: "Subhash Nagar Overbridge", category: "Flyover Link", lat: 23.2512, lng: 77.4292, description: "Overbridge connecting Old & New Bhopal" },
  { name: "Roshanpura Square / Polytechnic", category: "Civic Junction", lat: 23.2422, lng: 77.4095, description: "Apex of Link Road 1 & VIP corridor" },
  { name: "Ashoka Garden / 80 Feet Road", category: "Commercial District", lat: 23.2620, lng: 77.4265, description: "North-central transit corridor" },
];

export function getLocalLocationSuggestions(query: string): LocationSuggestion[] {
  const q = query.trim().toLowerCase();
  return BHOPAL_LANDMARKS.filter(
    (l) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
  ).slice(0, 8);
}

export async function searchLocationSuggestions(query: string): Promise<LocationSuggestion[]> {
  const localMatches = getLocalLocationSuggestions(query);
  const q = query.trim().toLowerCase();
  if (q.length < 3) {
    return localMatches;
  }

  // If online query has 3+ chars, try fetching extra Nominatim candidates with a 1.2s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(
      `${NOMINATIM}/search?format=json&limit=5&bounded=1&viewbox=77.25,23.40,77.60,23.10&q=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const items = await res.json();
      const osmMatches: LocationSuggestion[] = items.map((item: { display_name: string; lat: string; lon: string; type?: string }) => {
        const parts = item.display_name.split(",");
        const title = parts[0]?.trim() || item.display_name;
        const sub = parts.slice(1, 3).join(",").trim();
        return {
          name: title,
          category: item.type ? item.type.replace(/_/g, " ") : "Location",
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          description: sub || "OpenStreetMap Location",
        };
      });

      // Merge and remove duplicates by proximity
      const combined = [...localMatches];
      for (const osm of osmMatches) {
        if (!combined.some((c) => Math.hypot(c.lat - osm.lat, c.lng - osm.lng) < 0.003)) {
          combined.push(osm);
        }
      }
      return combined.slice(0, 8);
    }
  } catch {
    // Return local matches if offline or timed out
  }

  return localMatches.slice(0, 7);
}

// "lat, lng" is used as-is; anything else is searched.
export async function geocode(q: string): Promise<LatLng> {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: +m[1], lng: +m[2] };
  const matched = BHOPAL_LANDMARKS.find((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  if (matched) return { lat: matched.lat, lng: matched.lng };

  const res = await fetch(`${NOMINATIM}/search?format=json&limit=1&bounded=1&viewbox=77.25,23.40,77.60,23.10&q=${encodeURIComponent(q)}`);
  const [hit] = await res.json();
  if (!hit) throw new Error(`No place called "${q}" found in Bhopal`);
  return { lat: +hit.lat, lng: +hit.lon };
}

export async function reverseGeocode(p: LatLng): Promise<string> {
  const nearest = BHOPAL_LANDMARKS.find((l) => Math.hypot(l.lat - p.lat, l.lng - p.lng) < 0.005);
  if (nearest) return nearest.name;
  const fallback = `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=json&zoom=17&lat=${p.lat}&lon=${p.lng}`);
    const a = (await res.json()).address ?? {};
    return [a.road ?? a.neighbourhood, a.suburb ?? a.city_district].filter(Boolean).join(", ") || fallback;
  } catch {
    return fallback;
  }
}

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker. */
export const parseUtc = (s: string) => new Date(s.replace(" ", "T") + "Z");

export const ROUTE_COLORS = ["#2563eb", "#0d9488"];
export const ui = {
  card: "rounded-2xl bg-white shadow-sm dark:bg-zinc-900",
  pill: "rounded-full bg-white shadow-md dark:bg-zinc-900",
  input: "mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800",
  primary: "rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900",
  secondary: "rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
};
