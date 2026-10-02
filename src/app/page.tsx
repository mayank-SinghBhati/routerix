"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { NetworkDiagram } from "@/components/NetworkDiagram";
import { RouteRixLogo } from "@/components/RouteRixLogo";
import type { Me } from "@/components/RouteMap";
import {
  ApiError,
  getLocalLocationSuggestions,
  getStats,
  getTrip,
  reverseGeocode,
  ROUTE_COLORS,
  searchLocationSuggestions,
  simulate,
  useUser,
  type LatLng,
  type LocationSuggestion,
  type Scenario,
  type SimulationResult,
  type Stats,
} from "@/lib/api";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

type Place = LatLng & { name: string };
type View = "baseline" | "optimized";

const PRESETS: [Place, Place][] = [
  [{ lat: 23.2745, lng: 77.3765, name: "Lalghati Square" }, { lat: 23.2332, lng: 77.4343, name: "MP Nagar Zone 1" }],
  [{ lat: 23.2332, lng: 77.4343, name: "MP Nagar Zone 1" }, { lat: 23.2665, lng: 77.4136, name: "Bhopal Junction" }],
  [{ lat: 23.2225, lng: 77.4388, name: "Rani Kamlapati" }, { lat: 23.2368, lng: 77.4018, name: "New Market" }],
  [{ lat: 23.261, lng: 77.3795, name: "VIP Road" }, { lat: 23.2295, lng: 77.4575, name: "AIIMS Bhopal" }],
];

const TRAFFIC: { value: Scenario; label: string; vehicles: number }[] = [
  { value: "normal", label: "Light", vehicles: 500 },
  { value: "peak", label: "Peak", vehicles: 1000 },
  { value: "high_demand", label: "Heavy", vehicles: 2000 },
  { value: "road_closure", label: "Closure", vehicles: 750 },
];

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${m.toFixed(1)} min`);
const tone = (vc: number) => (vc > 1 ? "text-danger" : vc > 0.75 ? "text-warn" : "text-good");

export default function Home() {
  const router = useRouter();
  const [user] = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [from, setFrom] = useState<Place>(PRESETS[0][0]);
  const [to, setTo] = useState<Place>(PRESETS[0][1]);
  const [text, setText] = useState({ from: from.name, to: to.name });
  const [pickNext, setPickNext] = useState<"from" | "to">("from");
  const [scenario, setScenario] = useState<Scenario>("peak");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [view, setView] = useState<View>("optimized");
  const [panel, setPanel] = useState<"map" | "diagram">("map");
  const [showVehicles, setShowVehicles] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runId = useRef(0);

  const run = async (a = from, b = to, sc = scenario) => {
    const id = ++runId.current;
    setBusy(true);
    setError("");
    try {
      const res = await simulate({
        origin: a, destination: b, origin_label: a.name, destination_label: b.name,
        vehicles: TRAFFIC.find((t) => t.value === sc)?.vehicles ?? 1000, k_routes: 2, scenario: sc, closures: [],
      });
      if (id !== runId.current) return; // a newer request superseded this one
      setResult(res);
      getStats().then(setStats, () => {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      if (id === runId.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === runId.current) setBusy(false);
    }
  };

  // First load: reopen a saved trip from ?trip=, otherwise run the default corridor.
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("trip"));
    if (!id) { run(); return; } // eslint-disable-line react-hooks/set-state-in-effect -- kicks off a fetch
    getTrip(id).then((r) => {
      const q = r.request;
      const a = { lat: q.origin[0], lng: q.origin[1], name: q.origin_label || q.origin.join(", ") };
      const b = { lat: q.destination[0], lng: q.destination[1], name: q.destination_label || q.destination.join(", ") };
      setFrom(a); setTo(b); setText({ from: a.name, to: b.name }); setScenario(q.scenario);
      setResult({ ...r, trip_id: id });
      getStats().then(setStats, () => {});
    }, (e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tracking) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => {
        setError(e.code === e.PERMISSION_DENIED ? "Location permission was denied in browser settings." : `Location unavailable: ${e.message}`);
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  const setPlace = (which: "from" | "to", p: Place) => {
    (which === "from" ? setFrom : setTo)(p);
    setText((t) => ({ ...t, [which]: p.name }));
    run(which === "from" ? p : from, which === "to" ? p : to);
  };

  const pickOnMap = (p: LatLng) => {
    const which = pickNext;
    setPickNext(which === "from" ? "to" : "from");
    const name = `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
    setPlace(which, { ...p, name });
    reverseGeocode(p).then((n) => {
      (which === "from" ? setFrom : setTo)((cur) => (cur.lat === p.lat && cur.lng === p.lng ? { ...cur, name: n } : cur));
      setText((t) => (t[which] === name ? { ...t, [which]: n } : t));
    });
  };

  const swap = () => {
    setFrom(to); setTo(from); setText({ from: text.to, to: text.from });
    run(to, from);
  };

  const ev = result?.[view];
  const base = result?.baseline, opt = result?.optimized;
  const Q = result?.scenario.effective_demand_veh_h ?? 0;
  const delta = base && opt ? (view === "optimized" ? opt.average_travel_time_min - base.average_travel_time_min : base.average_travel_time_min - opt.average_travel_time_min) : 0;
  const closed = !!result?.scenario.closed_roads.length;

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas text-ink lg:grid-cols-[minmax(380px,440px)_1fr] lg:grid-rows-[auto_auto_1fr]">
      {/* Header */}
      <header className="relative flex h-16 items-center justify-between border-b border-line bg-surface px-5 lg:col-start-1 lg:border-r">
        <Link href="/" aria-label="RouteRix home"><RouteRixLogo size="sm" /></Link>
        <AppHeader user={user} />
        <div aria-hidden className={`absolute inset-x-0 -bottom-px h-0.5 overflow-hidden transition-opacity ${busy ? "opacity-100" : "opacity-0"}`}>
          <div className="progress h-full w-2/5 bg-accent" />
        </div>
      </header>

      {/* Trip controls */}
      <section className="space-y-6 bg-surface px-5 pb-6 pt-6 lg:col-start-1 lg:border-r lg:border-line">
        <div className="rise">
          <h1 className="text-2xl font-semibold tracking-tight">Plan a trip across Bhopal</h1>
          <p className="mt-1 text-sm text-muted">Compare everyone taking the fastest road with a split that keeps both roads moving.</p>
        </div>

        <div className="rise relative z-20 rounded-2xl border border-line bg-surface" style={{ ["--i" as string]: 1 }}>
          <PlaceInput label="From" dot="bg-zinc-900 dark:bg-zinc-100" value={text.from}
            onText={(v) => setText((t) => ({ ...t, from: v }))} onSelect={(s) => setPlace("from", { lat: s.lat, lng: s.lng, name: s.name })} />
          <div className="ml-11 border-t border-line" />
          <PlaceInput label="To" dot="bg-red-600" value={text.to}
            onText={(v) => setText((t) => ({ ...t, to: v }))} onSelect={(s) => setPlace("to", { lat: s.lat, lng: s.lng, name: s.name })} />
          <button onClick={swap} aria-label="Swap start and destination"
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted transition hover:rotate-180 hover:border-edge hover:text-ink active:scale-95">
            <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <div className="rise -mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" style={{ ["--i" as string]: 2 }}>
          {PRESETS.map(([a, b]) => {
            const on = from.name === a.name && to.name === b.name;
            return (
              <button key={a.name + b.name} onClick={() => { setFrom(a); setTo(b); setText({ from: a.name, to: b.name }); run(a, b); }}
                aria-pressed={on}
                className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97] ${on ? "border-ink bg-ink text-canvas" : "border-line text-muted hover:border-edge hover:text-ink"}`}>
                {a.name} → {b.name}
              </button>
            );
          })}
        </div>

        <div className="rise space-y-2" style={{ ["--i" as string]: 3 }}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Traffic</span>
            <span key={Q} className="tick tabular-nums text-muted">{Q ? `${Q.toLocaleString()} vehicles/h` : ""}</span>
          </div>
          <Segmented label="Traffic level" value={scenario} options={TRAFFIC}
            onChange={(sc) => { setScenario(sc); run(from, to, sc); }} />
          {closed && <p className="tick text-xs text-danger">Route A is closed, so all traffic takes route B.</p>}
        </div>

        {error && <p role="alert" className="tick rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </section>

      {/* Map / diagram */}
      <div className="relative isolate h-[60dvh] min-h-[360px] overflow-hidden bg-subtle lg:sticky lg:top-0 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-dvh lg:self-start">
        <RouteMap origin={from} destination={to} onPick={pickOnMap} result={result} view={view}
          showVehicles={showVehicles} me={me} follow={tracking} />

        <div className={`absolute inset-0 z-[900] grid place-items-center bg-surface/95 p-6 backdrop-blur-sm transition-opacity duration-500 ${panel === "diagram" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {panel === "diagram" && <NetworkDiagram result={result} view={view} />}
        </div>

        <div className="absolute inset-x-3 top-3 z-[1000] flex flex-wrap items-start justify-between gap-2">
          <div className="w-40 sm:w-52"><Segmented label="Display" value={panel} onChange={setPanel}
            options={[{ value: "map", label: "Map" }, { value: "diagram", label: "Diagram" }]} floating /></div>
          {panel === "map" && (
            <div className="flex gap-2">
              <MapChip on={showVehicles} onClick={() => setShowVehicles(!showVehicles)}>Vehicles</MapChip>
              <MapChip on={tracking} onClick={() => {
                if (!tracking && !("geolocation" in navigator)) return setError("This browser cannot share location");
                if (tracking) setMe(null);
                setTracking(!tracking);
              }}>{tracking ? "Stop tracking" : "My location"}</MapChip>
            </div>
          )}
        </div>

        {panel === "map" && (
          <p className="pointer-events-none absolute bottom-10 left-1/2 z-[600] whitespace-nowrap sm:bottom-3 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1.5 text-xs text-canvas shadow-sm backdrop-blur">
            Click the map to set the {pickNext === "from" ? "start" : "destination"}
          </p>
        )}
      </div>

      {/* Results */}
      <section aria-live="polite" className="space-y-7 border-t border-line bg-surface px-5 pb-10 pt-6 lg:col-start-1 lg:border-r">
        <Segmented label="Assignment" value={view} onChange={setView}
          options={[{ value: "baseline", label: "Fastest road" }, { value: "optimized", label: "Balanced split" }]} />

        {!result || !ev || !base || !opt ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-subtle" />)}
          </div>
        ) : (
          <>
            <div key={`${result.trip_id}-${view}`} className="rise">
              <p className="text-sm text-muted">Average trip</p>
              <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight">{mins(ev.average_travel_time_min)}</p>
              <p className={`mt-2 text-sm font-medium tabular-nums ${Math.abs(delta) < 0.05 ? "text-muted" : delta < 0 ? "text-good" : "text-danger"}`}>
                {Math.abs(delta) < 0.05 ? "Same as the other assignment" : `${delta < 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)} min vs ${view === "optimized" ? "fastest road" : "balanced split"}`}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {ev.allocation.map((n, i) => (
                  <div key={i} className="h-full rounded-full transition-[flex-grow] duration-700 ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{ flexGrow: Math.max(n, 0.0001), background: ROUTE_COLORS[i] }} />
                ))}
              </div>
              <ul className="space-y-1">
                {result.routes.map((r, i) => {
                  const isClosed = closed && i === 0;
                  return (
                    <li key={r.id} className="rise flex gap-3 rounded-xl px-1 py-2.5" style={{ ["--i" as string]: i }}>
                      <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ROUTE_COLORS[i] }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="shrink-0 tabular-nums">{isClosed ? "Closed" : mins(ev.route_travel_time_min[i])}</p>
                        </div>
                        <p className="truncate text-xs text-muted" title={r.via}>{r.via}</p>
                        <p className="mt-1 text-xs tabular-nums text-muted">
                          {r.length_km.toFixed(1)} km, {Math.round((100 * ev.allocation[i]) / Math.max(1, Q))}% of traffic,{" "}
                          <span className={isClosed ? "text-danger" : tone(ev.edge_vc[i])}>{isClosed ? "closed" : `${Math.round(100 * ev.edge_vc[i])}% of capacity`}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium">Fastest road vs balanced split</h2>
              <dl className="divide-y divide-line text-sm">
                {[
                  ["Average trip", mins(base.average_travel_time_min), mins(opt.average_travel_time_min)],
                  ["Busiest road load", `${Math.round(base.max_vc * 100)}%`, `${Math.round(opt.max_vc * 100)}%`],
                  ["Total time on roads", `${Math.round(base.total_network_travel_time_veh_h)} veh·h`, `${Math.round(opt.total_network_travel_time_veh_h)} veh·h`],
                ].map(([k, a, b]) => (
                  <div key={k} className="grid grid-cols-[1fr_auto_auto] gap-4 py-2.5 tabular-nums">
                    <dt className="text-muted">{k}</dt>
                    <dd className={view === "baseline" ? "font-medium" : "text-muted"}>{a}</dd>
                    <dd className={view === "optimized" ? "font-medium" : "text-muted"}>{b}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {stats && stats.trips > 0 && (
              <p className="text-xs text-muted">
                {stats.trips} simulations so far, {stats.veh_hours_saved.toFixed(0)} vehicle-hours saved.{" "}
                <Link href="/account" className="font-medium text-accent hover:underline">See history</Link>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, floating }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; floating?: boolean;
}) {
  const i = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label}
      className={`relative grid rounded-full p-1 ${floating ? "border border-line bg-surface/90 shadow-sm backdrop-blur" : "bg-subtle"}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className={`absolute inset-y-1 left-1 rounded-full shadow-sm transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${floating ? "bg-ink" : "bg-surface dark:bg-zinc-700"} ${i < 0 ? "opacity-0" : ""}`}
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${Math.max(0, i) * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => o.value !== value && onChange(o.value)}
          className={`relative h-8 rounded-full px-2 text-sm font-medium transition-colors duration-300 ${o.value === value ? (floating ? "text-canvas" : "text-ink") : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MapChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`h-9 rounded-full border px-3 text-[13px] font-medium shadow-sm sm:h-10 sm:px-4 sm:text-sm backdrop-blur transition active:scale-[0.97] ${on ? "border-ink bg-ink text-canvas" : "border-line bg-surface/90 text-ink hover:border-edge"}`}>
      {children}
    </button>
  );
}

/** Search box with Bhopal landmarks first, then OpenStreetMap results. Arrow keys + Enter to pick. */
function PlaceInput({ label, dot, value, onText, onSelect }: {
  label: string; dot: string; value: string; onText: (v: string) => void; onSelect: (s: LocationSuggestion) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<{ q: string; items: LocationSuggestion[] } | null>(null);
  const [active, setActive] = useState(0);
  const items = remote?.q === value ? remote.items : getLocalLocationSuggestions(value);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => searchLocationSuggestions(value).then((r) => live && setRemote({ q: value, items: r })), 350);
    return () => { live = false; clearTimeout(t); };
  }, [value, open]);

  const choose = (s: LocationSuggestion | undefined) => {
    if (!s) return;
    onSelect(s);
    setOpen(false);
  };
  const show = open && items.length > 0;

  return (
    <div className="relative">
      <label htmlFor={id} className="flex items-center gap-3 py-1 pl-4 pr-14">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dot}`} />
        <span className="w-9 shrink-0 text-sm text-muted">{label}</span>
        <input id={id} role="combobox" aria-expanded={show} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={show ? `${id}-${active}` : undefined} autoComplete="off"
          value={value} placeholder="Search a place in Bhopal"
          onChange={(e) => { onText(e.target.value); setOpen(true); setActive(0); }}
          onFocus={(e) => { e.target.select(); setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="h-12 min-w-0 flex-1 truncate bg-transparent font-medium outline-none placeholder:font-normal" />
      </label>
      {show && (
        <ul id={`${id}-list`} role="listbox" className="pop absolute inset-x-0 top-full z-[1200] mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl shadow-zinc-900/10">
          {items.map((s, k) => (
            <li key={`${s.name}-${s.lat}`} id={`${id}-${k}`} role="option" aria-selected={k === active}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)} onMouseEnter={() => setActive(k)}
              className={`cursor-pointer rounded-lg px-3 py-2 ${k === active ? "bg-subtle" : ""}`}>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted">{s.description ?? s.category}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
