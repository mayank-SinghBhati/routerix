"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Field, PasswordField } from "@/components/AuthShell";
import { RouteRixLogo } from "@/components/RouteRixLogo";
import { auth, deleteTrip, getStats, listTrips, parseUtc, SCENARIO_LABELS, ui, useUser, type Stats, type Trip } from "@/lib/api";

const pct = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}%`);
const fmtDate = (s: string) => parseUtc(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function AccountPage() {
  const [user, setUser] = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    getStats().then(setStats, (e) => setError(e.message));
    listTrips().then(setTrips, (e) => setError(e.message));
  };
  useEffect(() => { if (user) load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (t: Trip) => {
    if (!confirm(`Delete the trip from ${t.origin_label || "start"} to ${t.destination_label || "destination"}?`)) return;
    try { await deleteTrip(t.id); load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="min-h-dvh bg-zinc-200/70 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8 p-5 lg:px-12 lg:py-8">
        <AppHeader user={user}>
          <Link href="/" className="mr-auto">
            <RouteRixLogo size="sm" />
          </Link>
        </AppHeader>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <section aria-labelledby="stats-h" className="space-y-4">
          <h1 id="stats-h" className="text-xl font-semibold">Your stats</h1>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label="Simulations run" value={stats ? String(stats.trips) : "…"} />
            <Tile label="Vehicles routed (PCU/h)" value={stats ? stats.vehicles_routed.toLocaleString() : "…"} />
            <Tile label="Vehicle-hours saved vs Dijkstra" value={stats ? stats.veh_hours_saved.toFixed(1) : "…"} />
            <Tile label="Avg trip-time improvement" value={stats ? pct(stats.avg_trip_improvement_pct) : "…"} />
          </div>
          {stats && stats.trips > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className={`${ui.card} p-5 text-sm`}>
                <h2 className="mb-3 font-medium">By scenario</h2>
                {stats.by_scenario.map((s) => (
                  <div key={s.scenario} className="mb-2">
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>{SCENARIO_LABELS[s.scenario] ?? s.scenario}</span>
                      <span className="tabular-nums">{s.trips} runs · avg {pct(s.avg_trip_improvement_pct)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                      <div className="h-full rounded bg-teal-700 dark:bg-teal-400" style={{ width: `${(100 * s.trips) / stats.trips}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`${ui.card} p-5 text-sm`}>
                <h2 className="mb-3 font-medium">Last 30 days</h2>
                <Days data={stats.by_day} />
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="trips-h" className={`${ui.card} overflow-x-auto p-5`}>
          <h2 id="trips-h" className="mb-3 text-xl font-semibold">Trip history</h2>
          {trips === null ? <p className="text-sm text-zinc-500">Loading…</p> : trips.length === 0 ? (
            <p className="text-sm text-zinc-500">No trips yet. <Link href="/" className="text-teal-800 underline dark:text-teal-300">Run your first simulation</Link>.</p>
          ) : (
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>{["When", "Route", "Scenario", "Demand", "Avg trip (Dijkstra → QPSO)", "Improvement", ""].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody className="tabular-nums">
                {trips.map((t) => (
                  <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">{fmtDate(t.created_at)}</td>
                    <td className="pr-3">{t.origin_label || "Start"} → {t.destination_label || "Destination"}<span className="block text-xs text-zinc-500">{t.shortest_km.toFixed(1)} km shortest · K={t.k_routes}</span></td>
                    <td className="pr-3">{SCENARIO_LABELS[t.scenario] ?? t.scenario}{(t.scenario === "live" || t.traffic_source.includes("live")) && <span className="ml-1 rounded bg-teal-100 px-1 text-xs text-teal-900 dark:bg-teal-900 dark:text-teal-100">live</span>}</td>
                    <td className="pr-3">{t.vehicles}</td>
                    <td className="pr-3">{t.baseline_avg_min.toFixed(1)} → {t.optimized_avg_min.toFixed(1)} min</td>
                    <td className="pr-3 font-medium">{pct(t.avg_improvement_pct)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/?trip=${t.id}`} className="rounded px-2 py-1 text-teal-800 hover:bg-zinc-100 dark:text-teal-300 dark:hover:bg-zinc-800">Open on map</Link>
                      <button onClick={() => remove(t)} className="rounded px-2 py-1 text-red-700 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {user && (
          <div className="grid gap-4 md:grid-cols-2">
            <Profile user={user} onSaved={setUser} />
            <ChangePassword />
          </div>
        )}
        <p className="text-xs text-zinc-500">Member since {user ? fmtDate(user.created_at) : "…"}</p>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${ui.card} p-5`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function Days({ data }: { data: Stats["by_day"] }) {
  const counts = new Map(data.map((d) => [d.day, d.trips]));
  const [today] = useState(() => Date.now()); // fixed per mount so renders stay pure
  const days = Array.from({ length: 30 }, (_, i) => new Date(today - (29 - i) * 86400e3).toISOString().slice(0, 10));
  const max = Math.max(1, ...counts.values());
  return (
    <div>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`Simulations per day, last 30 days: ${data.map((d) => `${d.day} ${d.trips}`).join(", ") || "none"}`}>
        {days.map((d) => (
          <div key={d} title={`${d}: ${counts.get(d) ?? 0}`} className="flex-1 rounded-t bg-teal-700 dark:bg-teal-400" style={{ height: `${((counts.get(d) ?? 0) / max) * 100}%`, minHeight: 2, opacity: counts.get(d) ? 1 : 0.2 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500"><span>{days[0]}</span><span>today</span></div>
    </div>
  );
}

function Profile({ user, onSaved }: { user: NonNullable<ReturnType<typeof useUser>[0]>; onSaved: (u: typeof user) => void }) {
  const [f, setF] = useState({ name: user.name, email: user.email, current_password: "" });
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  const emailChanged = f.email.trim().toLowerCase() !== user.email;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try {
      onSaved(await auth.updateMe({ name: f.name, email: f.email, current_password: f.current_password || undefined }));
      setF((x) => ({ ...x, current_password: "" }));
      setMsg(["Profile saved", true]);
    } catch (err) { setMsg([err instanceof Error ? err.message : String(err), false]); }
  };
  return (
    <form onSubmit={save} className={`${ui.card} space-y-4 p-5`}>
      <h2 className="text-lg font-semibold">Profile</h2>
      <Field label="Full name" autoComplete="name" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Field label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      {emailChanged && <PasswordField label="Current password (to change email)" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} />}
      <Msg m={msg} />
      <button className={ui.primary}>Save profile</button>
    </form>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (f.next !== f.confirm) return setMsg(["New passwords don't match", false]);
    try {
      await auth.changePassword(f.current, f.next);
      setF({ current: "", next: "", confirm: "" });
      setMsg(["Password changed. Other devices were signed out.", true]);
    } catch (err) { setMsg([err instanceof Error ? err.message : String(err), false]); }
  };
  return (
    <form onSubmit={save} className={`${ui.card} space-y-4 p-5`}>
      <h2 className="text-lg font-semibold">Change password</h2>
      <PasswordField label="Current password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      <PasswordField label="New password" autoComplete="new-password" minLength={8} hint="At least 8 characters." value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      <PasswordField label="Confirm new password" autoComplete="new-password" minLength={8} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      <Msg m={msg} />
      <button className={ui.primary}>Change password</button>
    </form>
  );
}

function Msg({ m }: { m: [string, boolean] | null }) {
  if (!m) return null;
  return <p role={m[1] ? "status" : "alert"} className={`text-sm ${m[1] ? "text-teal-800 dark:text-teal-300" : "text-red-600"}`}>{m[0]}</p>;
}
