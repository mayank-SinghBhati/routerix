"use client";
import React from "react";

export function RouteRixMark({ size = 38, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="RouteRix Icon"
    >
      <defs>
        {/* Top bar & loop gradient */}
        <linearGradient id="rr_top_grad" x1="10" y1="20" x2="105" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0052d4" />
          <stop offset="45%" stopColor="#0072ff" />
          <stop offset="100%" stopColor="#00d2ff" />
        </linearGradient>

        {/* Right curved road leg gradient */}
        <linearGradient id="rr_road_grad" x1="30" y1="40" x2="110" y2="105" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#00f0ff" />
        </linearGradient>

        {/* Left road leg gradient */}
        <linearGradient id="rr_left_leg_grad" x1="15" y1="50" x2="50" y2="105" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        {/* Arrow tip glow gradient */}
        <linearGradient id="rr_arrow_grad" x1="60" y1="35" x2="95" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>

        <filter id="rr_glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#00d2ff" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Top horizontal arm & curve of R */}
      <path
        d="M 16 28 C 16 23 20 20 25 20 L 76 20 C 94 20 106 32 106 46 C 106 58 96 68 82 70 L 68 70 C 65 70 63 68 64 65 C 66 61 70 56 75 54 C 84 51 90 45 88 36 C 86 28 78 27 68 27 L 32 27 C 27 27 23 28 16 28 Z"
        fill="url(#rr_top_grad)"
      />

      {/* Upper loop accent highlight */}
      <path
        d="M 28 24 L 72 24 C 88 24 98 32 98 42 C 98 47 94 53 84 56 C 88 47 88 35 74 31 L 28 31 Z"
        fill="#ffffff"
        fillOpacity="0.22"
      />

      {/* Left highway leg of R (Dark navy asphalt) */}
      <path
        d="M 44 52 L 28 88 C 26 93 23 96 17 98 C 12 100 8 98 7 94 C 6 90 8 86 11 80 L 29 46 C 33 48 39 50 44 52 Z"
        fill="url(#rr_left_leg_grad)"
      />

      {/* Left road dashed lane marking */}
      <path
        d="M 36 50 L 17 91"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeDasharray="4 3.5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />

      {/* Right curved road leg of R (Vibrant highway flowing down to right) */}
      <path
        d="M 22 41 C 28 41 38 43 48 48 C 62 55 69 66 75 78 C 81 88 89 96 102 96 C 107 96 111 94 113 90 C 111 86 106 82 99 79 C 87 74 81 64 74 53 C 68 44 58 37 45 35 C 36 34 27 36 22 41 Z"
        fill="url(#rr_road_grad)"
        filter="url(#rr_glow)"
      />

      {/* Right road center dashed lane markings */}
      <path
        d="M 28 38 C 45 40 60 52 70 66 C 78 78 86 87 104 88"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeDasharray="4 4"
        strokeLinecap="round"
        strokeOpacity="0.95"
      />

      {/* Optimization Arrow Head at the R loop junction */}
      <path
        d="M 72 44 L 88 56 L 68 64 L 74 55 Z"
        fill="url(#rr_arrow_grad)"
      />
    </svg>
  );
}

const SIZES = { sm: [26, "text-lg"], md: [32, "text-xl"], lg: [44, "text-3xl"] } as const;

export function RouteRixLogo({ size = "md", mode = "auto", className = "" }: { size?: keyof typeof SIZES; mode?: "auto" | "dark"; className?: string }) {
  const [px, text] = SIZES[size];
  return (
    <span className={`flex select-none items-center gap-2.5 ${className}`}>
      <RouteRixMark size={px} />
      <span className={`font-semibold tracking-tight ${text} ${mode === "dark" ? "text-white" : "text-ink"}`}>
        Route<span className={mode === "dark" ? "text-sky-400" : "text-accent"}>Rix</span>
      </span>
    </span>
  );
}
