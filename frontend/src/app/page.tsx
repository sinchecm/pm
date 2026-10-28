"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import type { BoardData } from "@/lib/kanban";

type Status = "loading" | "ready" | "error";

// Resolves to null when signed out (401); rejects on any other failure
const fetchBoard = async (): Promise<BoardData | null> => {
  const response = await fetch("/api/board");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Board request failed: ${response.status}`);
  }
  return response.json();
};

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [notice, setNotice] = useState("");

  const loadBoard = () =>
    fetchBoard().then(
      (data) => {
        setBoard(data);
        setStatus("ready");
      },
      () => setStatus("error"),
    );

  useEffect(() => {
    loadBoard();
  }, []);

  const handleLogin = async () => {
    setNotice("");
    await loadBoard();
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setBoard(null);
  };

  const handleSessionExpired = () => {
    setNotice("Your session expired. Please sign in again.");
    setBoard(null);
  };

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
          Could not load your board. Please reload the page.
        </p>
      </main>
    );
  }
  if (!board) {
    return <LoginForm onLogin={handleLogin} notice={notice} />;
  }
  return (
    <KanbanBoard
      initialBoard={board}
      onLogout={handleLogout}
      onSessionExpired={handleSessionExpired}
    />
  );
}
