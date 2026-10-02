"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, ui } from "@/lib/api";
import { AuthShell, Field, PasswordField } from "@/components/AuthShell";

type Mode = "signin" | "signup" | "forgot";
const TITLES: Record<Mode, [string, string]> = {
  signin: ["Sign in", "Welcome back to RouteRix."],
  signup: ["Create your account", "Save simulations and track your results over time."],
  forgot: ["Reset your password", "We'll email you a link to choose a new one."],
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Already signed in? Skip the form.
  useEffect(() => {
    auth.me().then(
      () => router.replace("/"),
      () => {}
    );
  }, [router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const switchTo = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
  };

  const handleQuickDemoLogin = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.login("demo@routerix.in", "password123");
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const handleFillDemo = () => {
    setMode("signin");
    setForm({ name: "", email: "demo@routerix.in", password: "password123" });
    setError("");
    setNotice("Demo credentials populated. Click 'Sign in' or use 1-Click Access.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        setNotice((await auth.forgot(form.email)).message);
      } else {
        await (mode === "signin"
          ? auth.login(form.email, form.password)
          : auth.signup(form.name, form.email, form.password));
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const [title, subtitle] = TITLES[mode];

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {/* Judge & Evaluation Fast-Track Access */}
      <div className="mb-6 rounded-xl border border-teal-500/30 bg-teal-50/60 p-4 dark:border-teal-500/20 dark:bg-teal-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-900 dark:text-teal-200">
            <span className="inline-block size-2 rounded-full bg-teal-500 animate-pulse" />
            Judge &amp; Demo Access
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="text-xs font-medium text-teal-800 underline hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-100"
          >
            Auto-fill form
          </button>
        </div>

        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Instant evaluation access with pre-configured Bhopal simulation records and history:
        </p>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-1.5 font-mono text-xs text-zinc-700 shadow-xs dark:bg-zinc-900/80 dark:text-zinc-300">
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">Email:</span> demo@routerix.in
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">Pass:</span> password123
          </div>
        </div>

        <button
          type="button"
          onClick={handleQuickDemoLogin}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 active:scale-[0.99] disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {busy ? "Signing in…" : "Quick 1-Click Sign-In as Judge"}
        </button>
      </div>

      <div className="relative mb-6 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
        </div>
        <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
          or sign in manually
        </span>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <Field
            label="Full name"
            autoComplete="name"
            required
            maxLength={80}
            value={form.name}
            onChange={set("name")}
          />
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={form.email}
          onChange={set("email")}
        />
        {mode !== "forgot" && (
          <PasswordField
            label="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            value={form.password}
            onChange={set("password")}
            hint={mode === "signup" ? "At least 8 characters." : undefined}
            action={
              mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => switchTo("forgot")}
                  className="text-teal-800 hover:underline dark:text-teal-300"
                >
                  Forgot password?
                </button>
              ) : undefined
            }
          />
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-200"
          >
            {notice}
          </p>
        )}
        <button disabled={busy} className={`${ui.primary} w-full`}>
          {busy
            ? "Please wait…"
            : mode === "signin"
            ? "Sign in"
            : mode === "signup"
            ? "Create account"
            : "Send reset link"}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-3 text-sm text-zinc-500">
        <p>
          {mode === "signin" ? (
            <>
              New to RouteRix? <Switch onClick={() => switchTo("signup")}>Create an account</Switch>
            </>
          ) : (
            <>
              Already have an account? <Switch onClick={() => switchTo("signin")}>Sign in</Switch>
            </>
          )}
        </p>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>Explore Simulator as Guest without signing in</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function Switch({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-teal-800 hover:underline dark:text-teal-300"
    >
      {children}
    </button>
  );
}
