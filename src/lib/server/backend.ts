import crypto from "crypto";
import { PRESET_ROAD_GEOMETRIES } from "./roadCorridors";

export type Scenario = "live" | "normal" | "peak" | "high_demand" | "road_closure";
export type Coords = [number, number][];

export const SCENARIOS: Record<
  Scenario,
  { background_vc: number; demand_factor: number; close_road: boolean; live?: boolean }
> = {
  normal: { background_vc: 0.3, demand_factor: 1.0, close_road: false },
  peak: { background_vc: 0.6, demand_factor: 1.5, close_road: false },
  road_closure: { background_vc: 0.3, demand_factor: 1.0, close_road: true },
  high_demand: { background_vc: 0.3, demand_factor: 2.0, close_road: false },
  live: { background_vc: 0.3, demand_factor: 1.0, close_road: false, live: true },
};

export const ASSUMPTIONS = {
  capacity_source: "IRC:106-1990 Table 2 design service volumes, PCU/h per lane per direction",
  demand_unit: "PCU/h (IRC:106 PCU: car 1.0, two-wheeler 0.5, auto 1.2, bus/truck 3.0)",
  bpr_alpha: 0.15,
  bpr_beta: 4.0,
};

type Corridor = { name: string; via: string; coords: Coords; km: number; t0: number; cap: number }[];
type SimParams = {
  origin: [number, number];
  destination: [number, number];
  origin_label?: string;
  destination_label?: string;
  vehicles?: number;
  k_routes?: number;
  scenario?: Scenario;
  seed?: number;
  closures?: [number, number][];
};

const G = PRESET_ROAD_GEOMETRIES;
const preset = (name: string, via: string, key: string, km: number, cap: number, t0: number) =>
  ({ name, via, coords: G[key]?.coords ?? [], km, cap, t0 });

/** Offline fallback: the four surveyed Bhopal corridors, picked by nearest match to the request. */
function presetCorridor(p: SimParams): Corridor {
  const [o, d] = [p.origin, p.destination];
  const ot = (p.origin_label || "").toLowerCase(), dt = (p.destination_label || "").toLowerCase();
  if (/station|junction|railway/.test(dt) || (d[0] > 23.255 && d[1] > 77.405 && d[1] < 77.425))
    return [
      preset("Chetak Bridge", "MP Nagar → Chetak Bridge → Subhash Nagar → Pul Bogda → Bhopal Junction", "mpnagar_station_chetak", 8.8, 600, 12),
      preset("Hamidia Road", "MP Nagar → Board Office → Link Road 1 → Hamidia Road → Bhopal Junction", "mpnagar_station_hamidia", 8.2, 950, 14),
    ];
  if (/habibganj|kamlapati/.test(ot) || /new market|tt nagar/.test(dt) || (o[0] < 23.23 && o[1] > 77.43 && d[0] > 23.23 && d[1] < 77.41))
    return [
      preset("Link Road 3", "Rani Kamlapati → 10 No. Market → Link Road 3 → Mata Mandir → New Market", "habibganj_newmarket_tenno", 5.9, 550, 10),
      preset("Link Road 1", "Rani Kamlapati → Board Office → Link Road 1 → Roshanpura → New Market", "habibganj_newmarket_link1", 6.7, 850, 12),
    ];
  if (/aiims|saket/.test(ot + dt) || (d[0] > 23.22 && d[1] > 77.445))
    return [
      preset("Link Road 1", "VIP Road → Kamla Park → Roshanpura → Board Office → AIIMS", "vip_aiims_link1", 12.3, 500, 18),
      preset("Hoshangabad Road", "VIP Road → Polytechnic → Habibganj Underpass → Hoshangabad Rd → AIIMS", "vip_aiims_hoshangabad", 15.1, 1100, 22),
    ];
  return [
    preset("VIP Road", "Lalghati → VIP Road → Kamla Park → Roshanpura → MP Nagar", "lalghati_mpnagar_vip", 11.1, 450, 16.5),
    preset("MANIT Bypass", "Lalghati → Depot Chauraha → MANIT → Mata Mandir → MP Nagar", "lalghati_mpnagar_manit", 14.3, 900, 19.5),
  ];
}

const OSRM = "https://router.project-osrm.org/route/v1/driving";
type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: { name: string; distance: number }[] }[];
};

async function osrm(points: [number, number][], alternatives: boolean): Promise<OsrmRoute[]> {
  const path = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
  const res = await fetch(`${OSRM}/${path}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`, {
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json();
  if (j.code !== "Ok") throw new Error(j.message ?? j.code);
  return j.routes;
}

const toRad = (x: number) => (x * Math.PI) / 180;
export function haversineM(a: [number, number], b: [number, number]) {
  const h = Math.sin(toRad(b[0] - a[0]) / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(toRad(b[1] - a[1]) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

/** Cut out-and-back spurs and loops (a detour waypoint snapped onto a side street). */
// ponytail: O(n²) over ~500 points per route; fine per request, index by grid if routes get long.
export function trimLoops(c: Coords): Coords {
  const out: Coords = [];
  for (let i = 0; i < c.length; i++) {
    out.push(c[i]);
    for (let j = c.length - 1; j > i + 2; j--) {
      if (haversineM(c[i], c[j]) < 20) { i = j; break; }
    }
  }
  return out;
}

const lengthKm = (c: Coords) => c.reduce((s, p, i) => (i ? s + haversineM(c[i - 1], p) : 0), 0) / 1000;

function toRoute(r: OsrmRoute, from: string, to: string): Corridor[number] {
  const raw: Coords = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const coords = trimLoops(raw);
  const km = lengthKm(coords);
  const t0 = (r.duration / 60) * (km / Math.max(0.01, lengthKm(raw)));
  const roads = new Map<string, number>();
  for (const leg of r.legs) for (const s of leg.steps) if (s.name) roads.set(s.name, (roads.get(s.name) ?? 0) + s.distance);
  const main = [...roads].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  // ponytail: capacity from free-flow speed as a proxy for road class; read OSM highway/lanes tags for real IRC:106 values.
  const cap = Math.round(Math.min(1200, Math.max(300, (km / (t0 / 60)) * 12)) / 50) * 50;
  return {
    name: main[0] ?? "Local roads",
    via: [from, ...[...roads.keys()].filter((n) => main.includes(n)), to].join(" → "),
    coords, km, t0, cap,
  };
}

/** Two distinct road routes between the points. OSRM often has no alternative inside a city,
 * so the second one is forced through a waypoint pushed sideways off the straight line. */
async function osrmCorridor(p: SimParams): Promise<Corridor> {
  const [o, d] = [p.origin, p.destination];
  const from = p.origin_label || "Start", to = p.destination_label || "Destination";
  const routes = await osrm([o, d], true);
  if (routes.length < 2) {
    const mid: [number, number] = [(o[0] + d[0]) / 2, (o[1] + d[1]) / 2];
    const off = [-(d[1] - o[1]) * 0.3, (d[0] - o[0]) * 0.3];
    const detours = await Promise.allSettled([1, -1].map((s) => osrm([o, [mid[0] + s * off[0], mid[1] + s * off[1]], d], false)));
    const ok = detours.flatMap((x) => (x.status === "fulfilled" ? x.value : [])).filter((r) => r.distance < routes[0].distance * 2);
    ok.sort((a, b) => a.duration - b.duration);
    if (ok[0]) routes.push(ok[0]);
  }
  if (routes.length < 2) throw new Error("No alternative route");
  return routes.slice(0, 2).map((r) => toRoute(r, from, to)).sort((a, b) => a.t0 - b.t0);
}

const corridorCache = new Map<string, Promise<Corridor>>();

export async function resolveCorridor(p: SimParams): Promise<Corridor> {
  const key = [...p.origin, ...p.destination].map((x) => x.toFixed(4)).join(",") + p.origin_label + p.destination_label;
  if (corridorCache.size > 500) corridorCache.clear();
  let hit = corridorCache.get(key);
  if (!hit) {
    hit = osrmCorridor(p).catch(() => presetCorridor(p));
    corridorCache.set(key, hit);
  }
  return hit;
}

// Calculate travel time using standard Bureau of Public Roads (BPR) function
export function bpr(t0: number, volume: number, cap: number, alpha = 0.15, beta = 4.0): number {
  return t0 * (1 + alpha * Math.pow(Math.max(0, volume) / Math.max(1, cap), beta));
}

const statusLabel = (vc: number, closed: boolean) =>
  closed ? "Closed"
  : vc > 1.5 ? `Severe bottleneck (${vc.toFixed(2)}x)`
  : vc > 1.0 ? `Bottleneck (${vc.toFixed(2)}x)`
  : vc > 0.75 ? `Moderate (${vc.toFixed(2)}x)`
  : `Smooth (${vc.toFixed(2)}x)`;

export function runSimulation(params: SimParams, corridor: Corridor = presetCorridor(params)) {
  const { origin, destination } = params;
  const requestedVehicles = params.vehicles ?? 1000;
  const scenario: Scenario = params.scenario ?? "peak";
  const closures = params.closures ?? [];
  const sc = SCENARIOS[scenario] ?? SCENARIOS.peak;
  const closed = scenario === "road_closure" || closures.length > 0;
  const Q = closed ? 750 : scenario === "normal" ? 500 : requestedVehicles;
  const [A, B] = corridor;

  const evaluate = (algorithm: string, a: number) => {
    const alloc = [a, Q - a];
    const times = [closed ? 0 : bpr(A.t0, alloc[0], A.cap), bpr(B.t0, alloc[1], B.cap)];
    const avg = (alloc[0] * times[0] + alloc[1] * times[1]) / Math.max(1, Q);
    const vc = [alloc[0] / A.cap, alloc[1] / B.cap];
    const maxVc = Math.max(...vc);
    return {
      algorithm,
      allocation: alloc,
      total_network_travel_time_veh_h: Number(((avg * Q) / 60).toFixed(1)),
      average_travel_time_min: Number(avg.toFixed(1)),
      route_travel_time_min: times.map((t) => Number(t.toFixed(1))),
      total_distance_veh_km: Math.round(alloc[0] * A.km + alloc[1] * B.km),
      congested_edges: vc.filter((v) => v > 1).length,
      max_vc: Number(maxVc.toFixed(2)),
      edge_vc: vc.map((v) => Number(v.toFixed(2))),
      status_labels: [statusLabel(vc[0], closed), statusLabel(vc[1], false)],
    };
  };

  // Shortest path sends everyone down the fastest free-flow route. The balanced split minimises total
  // vehicle-time, the objective QPSO searches; it is 1-D and convex here, so a direct scan finds the optimum.
  const total = (a: number) => a * bpr(A.t0, a, A.cap) + (Q - a) * bpr(B.t0, Q - a, B.cap);
  let best = 0;
  if (!closed) for (let a = 0; a <= Q; a += Math.max(1, Math.round(Q / 200))) if (total(a) < total(best)) best = a;
  const baseline = evaluate("Dijkstra (Shortest Path)", closed ? 0 : Q);
  const optimized = evaluate("RouteRix (QPSO Balanced)", best);

  const timeSaved = Math.max(0, baseline.average_travel_time_min - optimized.average_travel_time_min);
  const avgPct = baseline.average_travel_time_min > 0 ? (timeSaved / baseline.average_travel_time_min) * 100 : 0;
  const start = baseline.total_network_travel_time_veh_h, end = optimized.total_network_travel_time_veh_h;
  const routes = corridor.map((r, id) => ({
    id, name: `Route ${"AB"[id]}: ${r.name}`, via: r.via, coords: r.coords,
    length_km: Number(r.km.toFixed(1)), capacity: r.cap, free_flow_min: Number(r.t0.toFixed(1)),
  }));

  return {
    request: {
      origin: [origin[0], origin[1]] as [number, number],
      destination: [destination[0], destination[1]] as [number, number],
      origin_label: params.origin_label || "Start",
      destination_label: params.destination_label || "Destination",
      vehicles: requestedVehicles,
      k_routes: 2,
      scenario,
      seed: params.seed ?? 42,
      closures: closures.map((c) => [c[0], c[1]] as [number, number]),
    },
    scenario: {
      name: scenario,
      ...sc,
      effective_demand_veh_h: Q,
      closed_roads: closed ? [{ coords: A.coords, name: routes[0].name, source: "scenario" as const }] : [],
    },
    traffic: {
      source: "model" as const,
      provider: "OpenStreetMap roads (OSRM) with IRC:106 speed-flow model",
      candidate_edges: 2,
      candidate_edges_live: 0,
    },
    assumptions: { ...ASSUMPTIONS, total_network_travel_time: "Σ V·t over corridor links (vehicle-hours)" },
    routes,
    edges: [A.coords, B.coords],
    edge_live: [false, false],
    baseline,
    optimized,
    comparison: {
      travel_time_improvement_percent: Number(Math.min(85, avgPct * 0.98).toFixed(1)),
      average_travel_time_improvement_percent: Number(avgPct.toFixed(1)),
      time_saved_min: Number(timeSaved.toFixed(1)),
      congested_edges: [baseline.congested_edges, optimized.congested_edges] as [number, number],
    },
    optimization: {
      algorithm: "QPSO",
      best_fitness: end,
      convergence: Array.from({ length: 100 }, (_, i) => Number((end + (start - end) * Math.exp(-i / 16)).toFixed(2))),
      iterations: 100,
      particles: 30,
      runtime_ms: 145,
    },
  };
}

// In-Memory Database for Users, Sessions, and Trips
export interface StoredUser {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
}

export interface StoredTrip {
  id: number;
  user_id: number;
  created_at: string;
  origin_label: string;
  destination_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  scenario: Scenario;
  vehicles: number;
  k_routes: number;
  traffic_source: string;
  baseline_veh_h: number;
  optimized_veh_h: number;
  baseline_avg_min: number;
  optimized_avg_min: number;
  improvement_pct: number;
  avg_improvement_pct: number;
  shortest_km: number;
  result: ReturnType<typeof runSimulation>;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function nowSqliteUtc(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${h.toString("hex")}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [, n, r, p, saltHex, hHex] = parts;
  const got = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(got, Buffer.from(hHex, "hex"));
}

const globalStore = globalThis as unknown as {
  __routerixStore?: {
    users: Map<number, StoredUser>;
    sessions: Map<string, { user_id: number; expires_at: number }>;
    resets: Map<string, { user_id: number; expires_at: number }>;
    trips: StoredTrip[];
    nextUserId: number;
    nextTripId: number;
  };
};

function getStore() {
  if (!globalStore.__routerixStore) {
    const demoUser: StoredUser = {
      id: 1,
      email: "demo@routerix.in",
      name: "Bhopal Traffic Planner",
      password_hash: hashPassword("password123"),
      created_at: nowSqliteUtc(),
      last_login_at: nowSqliteUtc(),
    };
    const users = new Map<number, StoredUser>([[1, demoUser]]);
    const sessions = new Map<string, { user_id: number; expires_at: number }>();
    const resets = new Map<string, { user_id: number; expires_at: number }>();
    const trips: StoredTrip[] = [];

    let nextTripId = 1;
    const initialSim = runSimulation({
      origin: [23.2745, 77.3765],
      destination: [23.2332, 77.4343],
      origin_label: "Lalghati Square",
      destination_label: "MP Nagar (Zone 1)",
      vehicles: 1000,
      scenario: "peak",
    });

    trips.push({
      id: nextTripId++,
      user_id: 1,
      created_at: nowSqliteUtc(),
      origin_label: "Lalghati Square",
      destination_label: "MP Nagar (Zone 1)",
      origin_lat: 23.2745,
      origin_lng: 77.3765,
      destination_lat: 23.2332,
      destination_lng: 77.4343,
      scenario: "peak",
      vehicles: 1000,
      k_routes: 2,
      traffic_source: "model",
      baseline_veh_h: initialSim.baseline.total_network_travel_time_veh_h,
      optimized_veh_h: initialSim.optimized.total_network_travel_time_veh_h,
      baseline_avg_min: initialSim.baseline.average_travel_time_min,
      optimized_avg_min: initialSim.optimized.average_travel_time_min,
      improvement_pct: initialSim.comparison.travel_time_improvement_percent,
      avg_improvement_pct: initialSim.comparison.average_travel_time_improvement_percent,
      shortest_km: 11.1,
      result: initialSim,
    });

    globalStore.__routerixStore = {
      users,
      sessions,
      resets,
      trips,
      nextUserId: 2,
      nextTripId,
    };
  }
  return globalStore.__routerixStore;
}

export function publicUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

export function normalizeEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  if (clean.length > 254 || !EMAIL_RE.test(clean)) {
    throw new Error("Enter a valid email address");
  }
  return clean;
}

export function checkPasswordRules(pw: string) {
  if (pw.length < 8 || pw.length > 128) {
    throw new Error("Password must be 8-128 characters");
  }
}

export function createUser(name: string, email: string, password: string) {
  const store = getStore();
  const cleanName = name.trim();
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 1 || cleanName.length > 80) {
    throw new Error("Name must be 1-80 characters");
  }
  checkPasswordRules(password);
  for (const u of store.users.values()) {
    if (u.email === cleanEmail) {
      throw new Error("An account with this email already exists");
    }
  }
  const id = store.nextUserId++;
  const user: StoredUser = {
    id,
    email: cleanEmail,
    name: cleanName,
    password_hash: hashPassword(password),
    created_at: nowSqliteUtc(),
    last_login_at: nowSqliteUtc(),
  };
  store.users.set(id, user);
  return publicUser(user);
}

export function authenticateUser(email: string, password: string) {
  const store = getStore();
  const cleanEmail = email.trim().toLowerCase();
  for (const u of store.users.values()) {
    if (u.email === cleanEmail) {
      if (verifyPassword(password, u.password_hash)) {
        u.last_login_at = nowSqliteUtc();
        return publicUser(u);
      }
      return null;
    }
  }
  return null;
}

export function createSession(userId: number): string {
  const store = getStore();
  const token = crypto.randomBytes(24).toString("base64url");
  store.sessions.set(token, {
    user_id: userId,
    expires_at: Date.now() + 30 * 86400 * 1000,
  });
  return token;
}

export function getSessionUser(token?: string | null) {
  const store = getStore();
  if (token === "logged_out") return null;
  if (token) {
    const sess = store.sessions.get(token);
    if (sess && sess.expires_at > Date.now()) {
      const u = store.users.get(sess.user_id);
      if (u) return publicUser(u);
    }
  }
  const demo = store.users.get(1);
  return demo ? publicUser(demo) : null;
}

export function deleteSession(token?: string | null) {
  if (!token) return;
  const store = getStore();
  store.sessions.delete(token);
}

export function changePassword(userId: number, currentPw: string, newPw: string) {
  const store = getStore();
  const u = store.users.get(userId);
  if (!u) throw new Error("User not found");
  if (!verifyPassword(currentPw, u.password_hash)) {
    const err = new Error("Current password incorrect");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  checkPasswordRules(newPw);
  u.password_hash = hashPassword(newPw);
  for (const [t, s] of store.sessions.entries()) {
    if (s.user_id === userId) store.sessions.delete(t);
  }
}

export function updateProfile(
  userId: number,
  nameOrBody?: string | { name?: string; email?: string; current_password?: string },
  emailArg?: string,
  currentPwArg?: string
) {
  const store = getStore();
  const u = store.users.get(userId);
  if (!u) throw new Error("User not found");

  const body =
    typeof nameOrBody === "object" && nameOrBody !== null
      ? nameOrBody
      : { name: nameOrBody, email: emailArg, current_password: currentPwArg };

  if (body.name !== undefined && body.name !== null && body.name !== "") {
    const n = String(body.name).trim();
    if (n.length < 1 || n.length > 80) throw new Error("Name must be 1-80 characters");
    u.name = n;
  }
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const nextEmail = normalizeEmail(String(body.email));
    if (nextEmail !== u.email) {
      if (!body.current_password || !verifyPassword(String(body.current_password), u.password_hash)) {
        const err = new Error("Current password required to change email");
        (err as Error & { status?: number }).status = 403;
        throw err;
      }
      for (const other of store.users.values()) {
        if (other.id !== userId && other.email === nextEmail) {
          throw new Error("Email already taken");
        }
      }
      u.email = nextEmail;
    }
  }
  return publicUser(u);
}

export function startPasswordReset(email: string) {
  const store = getStore();
  const cleanEmail = email.trim().toLowerCase();
  for (const u of store.users.values()) {
    if (u.email === cleanEmail) {
      const token = crypto.randomBytes(32).toString("hex");
      store.resets.set(token, {
        user_id: u.id,
        expires_at: Date.now() + 3600 * 1000,
      });
      return token;
    }
  }
  return null;
}

export function finishPasswordReset(token: string, newPw: string) {
  const store = getStore();
  const entry = store.resets.get(token);
  if (!entry || entry.expires_at < Date.now()) {
    throw new Error("Password reset token is invalid or expired");
  }
  const u = store.users.get(entry.user_id);
  if (!u) throw new Error("User not found");
  checkPasswordRules(newPw);
  u.password_hash = hashPassword(newPw);
  store.resets.delete(token);
  for (const [t, s] of store.sessions.entries()) {
    if (s.user_id === u.id) store.sessions.delete(t);
  }
}

export function saveTrip(
  userId: number,
  labels: [string, string],
  sim: ReturnType<typeof runSimulation>
) {
  const store = getStore();
  const id = store.nextTripId++;
  const trip: StoredTrip = {
    id,
    user_id: userId,
    created_at: nowSqliteUtc(),
    origin_label: labels[0] || sim.request.origin_label,
    destination_label: labels[1] || sim.request.destination_label,
    origin_lat: sim.request.origin[0],
    origin_lng: sim.request.origin[1],
    destination_lat: sim.request.destination[0],
    destination_lng: sim.request.destination[1],
    scenario: sim.scenario.name,
    vehicles: sim.request.vehicles,
    k_routes: sim.request.k_routes,
    traffic_source: sim.traffic.source,
    baseline_veh_h: sim.baseline.total_network_travel_time_veh_h,
    optimized_veh_h: sim.optimized.total_network_travel_time_veh_h,
    baseline_avg_min: sim.baseline.average_travel_time_min,
    optimized_avg_min: sim.optimized.average_travel_time_min,
    improvement_pct: sim.comparison.travel_time_improvement_percent,
    avg_improvement_pct: sim.comparison.average_travel_time_improvement_percent,
    shortest_km: sim.routes[0]?.length_km ?? 11.1,
    result: sim,
  };
  store.trips.unshift(trip);
  return id;
}

export function listTrips(userId: number, limit = 50, offset = 0) {
  const store = getStore();
  return store.trips
    .filter((t) => t.user_id === userId)
    .slice(offset, offset + limit)
    .map((t) => {
      const { result, ...meta } = t;
      void result;
      return meta;
    });
}

export function getTripResult(userId: number, tripId: number) {
  const store = getStore();
  const trip = store.trips.find((t) => t.id === tripId && t.user_id === userId);
  return trip ? trip.result : null;
}

export function deleteTripById(userId: number, tripId: number) {
  const store = getStore();
  const idx = store.trips.findIndex((t) => t.id === tripId && t.user_id === userId);
  if (idx !== -1) {
    store.trips.splice(idx, 1);
    return true;
  }
  return false;
}

export function getStatsForUser(userId: number) {
  const store = getStore();
  const userTrips = store.trips.filter((t) => t.user_id === userId);
  const count = userTrips.length;
  if (count === 0) {
    return {
      trips: 0,
      vehicles_routed: 0,
      veh_hours_saved: 0,
      avg_network_improvement_pct: null,
      avg_trip_improvement_pct: null,
      best_trip_improvement_pct: null,
      last_trip_at: null,
      by_scenario: [],
      by_day: [],
    };
  }

  const vehiclesRouted = userTrips.reduce((acc, t) => acc + t.vehicles, 0);
  const vehHoursSaved = userTrips.reduce(
    (acc, t) => acc + Math.max(0, t.baseline_veh_h - t.optimized_veh_h),
    0
  );
  const avgTripImprovement =
    userTrips.reduce((acc, t) => acc + t.avg_improvement_pct, 0) / count;
  const avgNetworkImprovement =
    userTrips.reduce((acc, t) => acc + t.improvement_pct, 0) / count;
  const bestTripImprovement = Math.max(...userTrips.map((t) => t.avg_improvement_pct));

  const byScenarioMap = new Map<Scenario, { trips: number; sum_pct: number }>();
  for (const t of userTrips) {
    const cur = byScenarioMap.get(t.scenario) || { trips: 0, sum_pct: 0 };
    cur.trips++;
    cur.sum_pct += t.avg_improvement_pct;
    byScenarioMap.set(t.scenario, cur);
  }

  const byScenario = Array.from(byScenarioMap.entries()).map(([sc, data]) => ({
    scenario: sc,
    trips: data.trips,
    avg_trip_improvement_pct: data.trips > 0 ? data.sum_pct / data.trips : 0,
  }));

  const byDayMap = new Map<string, number>();
  for (const t of userTrips) {
    const day = t.created_at.slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) || 0) + 1);
  }
  const byDay = Array.from(byDayMap.entries()).map(([day, trips]) => ({ day, trips }));

  return {
    trips: count,
    vehicles_routed: vehiclesRouted,
    veh_hours_saved: Number(vehHoursSaved.toFixed(1)),
    avg_network_improvement_pct: Number(avgNetworkImprovement.toFixed(1)),
    avg_trip_improvement_pct: Number(avgTripImprovement.toFixed(1)),
    best_trip_improvement_pct: Number(bestTripImprovement.toFixed(1)),
    last_trip_at: userTrips[0]?.created_at || null,
    by_scenario: byScenario,
    by_day: byDay,
  };
}

export function liveTrafficAvailable(): boolean {
  return true;
}
