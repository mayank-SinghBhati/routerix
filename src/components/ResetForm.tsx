"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, ui } from "@/lib/api";
import { AuthShell, PasswordField } from "@/components/AuthShell";

export default function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Drop the token from the address bar so it doesn't linger in browser history.
  useEffect(() => { if (token) history.replaceState(null, "", location.pathname); }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.a !== pw.b) return setError("Passwords don't match");
    setBusy(true); setError("");
    try { setDone((await auth.reset(token, pw.a)).message); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  if (token === "") {
    return (
      <AuthShell title="Link incomplete" subtitle="This reset link is missing its token.">
        <Link href="/login" className={`${ui.primary} block text-center`}>Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out of every device.">
      {done ? (
        <div className="space-y-4">
          <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-200">{done}</p>
          <Link href="/login" className={`${ui.primary} block text-center`}>Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <PasswordField label="New password" autoComplete="new-password" minLength={8} hint="At least 8 characters."
            value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
          <PasswordField label="Confirm new password" autoComplete="new-password" minLength={8}
            value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error} {error.includes("expired") && <Link href="/login" className="underline">Request a new link</Link>}
            </p>
          )}
          <button disabled={busy} className={`${ui.primary} w-full`}>{busy ? "Saving…" : "Set new password"}</button>
        </form>
      )}
    </AuthShell>
  );
}
