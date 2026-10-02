"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, type User } from "@/lib/api";

export function AppHeader({ user, children }: { user: User | null; children?: React.ReactNode }) {
  const router = useRouter();
  const signOut = async () => { await auth.logout().catch(() => {}); router.replace("/login"); };
  return (
    <header className="flex items-center justify-end gap-2">
      {children}
      <ThemeToggle />
      <details className="relative">
        <summary aria-label="Account menu" className="grid size-9 cursor-pointer list-none place-items-center rounded-full border border-line bg-surface transition hover:border-edge [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-sm font-semibold">{user?.name[0]?.toUpperCase() ?? ""}</span>
        </summary>
        <nav className="pop absolute right-0 z-[1100] mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm shadow-lg shadow-zinc-900/5">
          <p className="truncate px-4 pt-2 font-medium">{user?.name}</p>
          <p className="truncate px-4 pb-2 text-xs text-muted">{user?.email}</p>
          <Link href="/" className="block px-4 py-2 hover:bg-subtle">Route planner</Link>
          <Link href="/account" className="block px-4 py-2 hover:bg-subtle">Trips, stats &amp; account</Link>
          <button onClick={signOut} className="block w-full px-4 py-2 text-left text-red-700 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800">Sign out</button>
        </nav>
      </details>
    </header>
  );
}

// Two states per the dark-mode guide: follow the system, or pin the opposite.
function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const cur = root.classList.contains("dark") || (!root.classList.contains("light") && sys === "dark") ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    const pin = next !== sys;
    root.classList.remove("light", "dark");
    if (pin) root.classList.add(next);
    document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute("content", pin ? next : "light dark");
    try { if (pin) localStorage.setItem("color-scheme", next); else localStorage.removeItem("color-scheme"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="Toggle dark mode" className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted transition hover:border-edge hover:text-ink">
      <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current stroke-[1.5] dark:hidden">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg aria-hidden viewBox="0 0 24 24" className="hidden size-[18px] fill-none stroke-current stroke-[1.5] dark:block">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
