"use client";

import { useState } from "react";

export function SignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Sign-out failed");
      const { clearActiveRoute } = await import("../field/storage");
      await clearActiveRoute().catch(() => undefined);
      window.location.replace("/login");
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="relative shrink-0 text-right">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="rl-button min-h-11 whitespace-nowrap lg:min-h-9"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert" className="rl-panel absolute top-full right-0 z-20 mt-2 w-44 p-2 text-sm text-red-700">Could not sign out. Try again.</p>}
    </div>
  );
}
