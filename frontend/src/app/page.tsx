"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import type { BoardData } from "@/lib/kanban";

const fetchBoard = async (): Promise<BoardData | null> => {
  const response = await fetch("/api/board");
  return response.ok ? response.json() : null;
};

export default function Home() {
  const [checking, setChecking] = useState(true);
  const [board, setBoard] = useState<BoardData | null>(null);

  useEffect(() => {
    fetchBoard().then((data) => {
      setBoard(data);
      setChecking(false);
    });
  }, []);

  const handleLogin = async () => {
    setBoard(await fetchBoard());
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setBoard(null);
  };

  if (checking) {
    return null;
  }
  if (!board) {
    return <LoginForm onLogin={handleLogin} />;
  }
  return <KanbanBoard initialBoard={board} onLogout={handleLogout} />;
}
