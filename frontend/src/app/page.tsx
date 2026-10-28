"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setUsername(data?.username ?? null);
        setChecking(false);
      });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setUsername(null);
  };

  if (checking) {
    return null;
  }
  if (!username) {
    return <LoginForm onLogin={setUsername} />;
  }
  return <KanbanBoard onLogout={handleLogout} />;
}
