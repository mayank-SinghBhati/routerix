"use client";
import { useId, useState } from "react";
import { ui } from "@/lib/api";
import { RouteRixLogo } from "@/components/RouteRixLogo";

// Shared frame for /login and /reset-password: brand panel + form card.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-zinc-100 text-zinc-900 lg:grid-cols-[1.1fr_1fr] dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="relative hidden overflow-hidden bg-zinc-900 p-12 text-zinc-100 lg:flex lg:flex-col">
        <RoadArt />
        <div className="relative">
          <RouteRixLogo size="lg" mode="dark" />
        </div>
        <div className="relative mt-auto max-w-md space-y-6">
          <p className="text-3xl font-semibold leading-tight">Spread traffic across Bhopal&apos;s roads, not onto one of them.</p>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>Real road network from OpenStreetMap</li>
            <li>Capacities from IRC:106-1990, live speeds from real-time urban telemetry</li>
            <li>QPSO allocation vs Dijkstra shortest path</li>
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center p-5">
        <div className={`${ui.card} w-full max-w-md p-8`}>
          <div className="mb-6 lg:hidden">
            <RouteRixLogo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mb-6 mt-1 text-sm text-zinc-500">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; action?: React.ReactNode };

export function Field({ label, hint, action, ...props }: InputProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="font-medium">{label}</label>
        {action}
      </div>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={ui.input} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function PasswordField(props: InputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Field {...props} type={show ? "text" : "password"} required maxLength={128} />
      <button type="button" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-[1.9rem] rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700">
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function RoadArt() {
  return (
    <svg aria-hidden viewBox="0 0 400 400" className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="xMidYMid slice">
      <g fill="none" strokeLinecap="round">
        <path d="M-20 300 C 80 260, 120 140, 220 150 S 360 60, 420 40" stroke="#2563eb" strokeWidth="6" />
        <path d="M-20 330 C 90 320, 160 250, 240 250 S 350 180, 420 170" stroke="#0d9488" strokeWidth="4" />
        <path d="M-20 360 C 100 370, 200 330, 270 320 S 360 290, 420 290" stroke="#0891b2" strokeWidth="3" />
        <path d="M60 -20 L 140 420 M 260 -20 L 300 420 M -20 90 L 420 120" stroke="#3f3f46" strokeWidth="2" />
      </g>
    </svg>
  );
}
