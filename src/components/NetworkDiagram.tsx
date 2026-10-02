"use client";
import { ROUTE_COLORS, type SimulationResult } from "@/lib/api";

// Schematic of the two corridors: start on the left, destination on the right, one arc per route.
// Arc width tracks the share of traffic, the moving dashes track speed.
const O = [70, 170], D = [730, 170];
const ARCS = [
  [[230, 30], [570, 30]],
  [[230, 310], [570, 310]],
] as const;

const bez = (t: number, c: readonly (readonly number[])[]) => {
  const p = [O, c[0], c[1], D];
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t ** 3 * p[3][k]);
};
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function NetworkDiagram({ result, view }: { result: SimulationResult | null; view: "baseline" | "optimized" }) {
  if (!result) return null;
  const ev = result[view];
  const Q = ev.allocation.reduce((a, b) => a + b, 0) || 1;
  const closed = result.scenario.closed_roads.length > 0;
  return (
    <svg viewBox="0 0 800 340" className="h-auto w-full max-w-4xl select-none" role="img"
      aria-label={`Traffic split: ${result.routes.map((r, i) => `${r.name} ${ev.allocation[i]} vehicles per hour`).join(", ")}`}>
      {result.routes.map((r, i) => {
        const [c1, c2] = ARCS[i];
        const d = `M${O} C${c1} ${c2} ${D}`;
        const flow = ev.allocation[i];
        const isClosed = closed && i === 0;
        const speed = r.length_km / Math.max(0.1, ev.route_travel_time_min[i]); // km per min
        const stops = (r.via ?? "").split(" → ").slice(1, -1).slice(0, 3);
        const label = bez(0.5, ARCS[i]);
        const below = i === 1;
        return (
          <g key={`${i}-${view}`} className="rise" style={{ ["--i" as string]: i }}>
            <path d={d} fill="none" stroke="var(--color-line)" strokeWidth={4} />
            {flow > 0 && (
              <>
                <path d={d} fill="none" stroke={ROUTE_COLORS[i]} strokeWidth={4 + 16 * (flow / Q)} strokeLinecap="round" opacity={0.9}
                  className="transition-[stroke-width] duration-700" />
                <path d={d} fill="none" stroke="white" strokeWidth={2} strokeDasharray="2 14" strokeLinecap="round" opacity={0.85}
                  className="flow" style={{ animationDuration: `${Math.max(0.4, 0.6 / speed)}s` }} />
              </>
            )}
            {isClosed && <path d={d} fill="none" stroke="#dc2626" strokeWidth={4} strokeDasharray="2 10" strokeLinecap="round" />}
            {stops.map((s, k) => {
              const [x, y] = bez((k + 1) / (stops.length + 1), ARCS[i]);
              return (
                <g key={s}>
                  <circle cx={x} cy={y} r={5} className="fill-surface" stroke={ROUTE_COLORS[i]} strokeWidth={2.5} />
                  <text x={x} y={below ? y + 22 : y - 14} textAnchor="middle" className="fill-muted text-[11px]">{clip(s, 18)}</text>
                </g>
              );
            })}
            <text x={label[0]} y={below ? label[1] - 26 : label[1] + 34} textAnchor="middle" className="fill-ink text-[13px] font-semibold">
              {isClosed ? "Closed" : `${flow.toLocaleString()} veh/h · ${ev.route_travel_time_min[i].toFixed(1)} min`}
            </text>
          </g>
        );
      })}
      {[[O, result.request.origin_label ?? "Start", "#18181b"], [D, result.request.destination_label ?? "Destination", "#dc2626"]].map(([[x, y], name, fill], k) => (
        <g key={k}>
          <circle cx={x as number} cy={y as number} r={11} fill={fill as string} stroke="white" strokeWidth={3} />
          <text x={x as number} y={(y as number) + 32} textAnchor="middle" className="fill-ink text-[12px] font-medium">{clip(String(name))}</text>
        </g>
      ))}
    </svg>
  );
}
