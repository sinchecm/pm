"use client";

import { useCallback, useEffect, useState } from "react";
import { Landing } from "@/components/Landing";
import { Workspace } from "@/components/Workspace";
import { isUnauthorized, request } from "@/lib/api";
import type { User } from "@/lib/kanban";

type Status = "loading" | "ready" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    request<User>("/api/me").then(
      (me) => {
        setUser(me);
        setStatus("ready");
      },
      (error) => setStatus(isUnauthorized(error) ? "ready" : "error"),
    );
  }, []);

  const handleAuthenticated = (signedIn: User) => {
    setNotice("");
    setUser(signedIn);
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
  };

  // Stable, so effects in the workspace that depend on it don't re-run
  const handleSignedOut = useCallback((message: string) => {
    setNotice(message);
    setUser(null);
  }, []);

  if (status === "loading") {
    return null;
  }
  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p
          role="alert"
          className="text-sm font-medium text-[var(--secondary-purple)]"
        >
          Could not reach the server. Please reload the page.
        </p>
      </main>
    );
  }
  if (!user) {
    return <Landing onAuthenticated={handleAuthenticated} notice={notice} />;
  }
  return (
    <Workspace
      user={user}
      onLogout={handleLogout}
      onSignedOut={handleSignedOut}
    />
  );
}
