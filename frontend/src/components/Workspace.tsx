"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { AccountSettings } from "@/components/AccountSettings";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MyCards } from "@/components/MyCards";
import { fetchBoard, isUnauthorized, request } from "@/lib/api";
import type { BoardData, BoardSummary, Member, User } from "@/lib/kanban";

type WorkspaceProps = {
  user: User;
  onLogout: () => void;
  onSignedOut: (message: string) => void;
};

type OpenBoard = {
  id: number;
  data: BoardData;
  etag: string | null;
  members: Member[];
  commentCounts: Record<string, number>;
};

const SESSION_EXPIRED = "Your session expired. Please sign in again.";

// The selected board lives in the URL hash (#board-3) so a reload keeps it
const boardIdFromHash = () => {
  const match = window.location.hash.match(/^#board-(\d+)$/);
  return match ? Number(match[1]) : null;
};

const setHash = (boardId: number | null) =>
  history.replaceState(
    null,
    "",
    boardId === null ? window.location.pathname : `#board-${boardId}`,
  );

export const Workspace = ({ user, onLogout, onSignedOut }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [openBoard, setOpenBoard] = useState<OpenBoard | null>(null);
  const [view, setView] = useState<"board" | "account" | "cards">("board");
  const [error, setError] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSessionExpired = useCallback(
    () => onSignedOut(SESSION_EXPIRED),
    [onSignedOut],
  );

  const handleError = useCallback(
    (caught: unknown, message: string) => {
      if (isUnauthorized(caught)) {
        handleSessionExpired();
      } else {
        setError(message);
      }
    },
    [handleSessionExpired],
  );

  const selectBoard = useCallback(
    async (boardId: number | null) => {
      setView("board");
      setError("");
      setHash(boardId);
      if (boardId === null) {
        setOpenBoard(null);
        return;
      }
      try {
        const [{ data, etag }, members, commentCounts] = await Promise.all([
          fetchBoard<BoardData>(boardId),
          request<Member[]>(`/api/boards/${boardId}/members`),
          request<Record<string, number>>(`/api/boards/${boardId}/comment-counts`),
        ]);
        setOpenBoard({ id: boardId, data, etag, members, commentCounts });
      } catch (caught) {
        handleError(caught, "Could not load this board. Please try again.");
      }
    },
    [handleError],
  );

  useEffect(() => {
    request<BoardSummary[]>("/api/boards").then(
      (list) => {
        setBoards(list);
        const fromHash = boardIdFromHash();
        const initial = list.some((board) => board.id === fromHash)
          ? fromHash
          : (list[0]?.id ?? null);
        selectBoard(initial);
      },
      (caught) =>
        handleError(caught, "Could not load your boards. Please reload."),
    );
  }, [handleError, selectBoard]);

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name) {
      return;
    }
    try {
      const created = await request<BoardSummary>("/api/boards", "POST", {
        name,
      });
      setBoards((prev) => [...(prev ?? []), created]);
      setNewBoardName("");
      setIsCreating(false);
      await selectBoard(created.id);
    } catch (caught) {
      handleError(caught, "Could not create the board. Please try again.");
    }
  };

  const handleRenameBoard = async (boardId: number, name: string) => {
    try {
      const renamed = await request<BoardSummary>(
        `/api/boards/${boardId}`,
        "PATCH",
        { name },
      );
      setBoards((prev) =>
        (prev ?? []).map((board) => (board.id === boardId ? renamed : board)),
      );
    } catch (caught) {
      handleError(caught, "Could not rename the board. Please try again.");
    }
  };

  const removeBoard = async (boardId: number) => {
    const remaining = (boards ?? []).filter((item) => item.id !== boardId);
    setBoards(remaining);
    await selectBoard(remaining[0]?.id ?? null);
  };

  const handleDeleteBoard = async (boardId: number) => {
    const board = boards?.find((item) => item.id === boardId);
    if (!window.confirm(`Delete the board "${board?.name}" and all its cards?`)) {
      return;
    }
    try {
      await request(`/api/boards/${boardId}`, "DELETE");
      await removeBoard(boardId);
    } catch (caught) {
      handleError(caught, "Could not delete the board. Please try again.");
    }
  };

  const openSummary = boards?.find((board) => board.id === openBoard?.id);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <header className="relative flex flex-wrap items-center justify-between gap-4 border-b border-[var(--stroke)] bg-white/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h1 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--gray-text)]">
            Signed in as{" "}
            <span
              data-testid="current-user"
              className="font-semibold text-[var(--navy-dark)]"
            >
              {user.username}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setView("account")}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
          >
            Account
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="relative flex flex-col lg:flex-row">
        <nav
          aria-label="Boards"
          className="flex shrink-0 flex-col gap-2 border-b border-[var(--stroke)] p-6 lg:min-h-[calc(100vh-73px)] lg:w-64 lg:border-b-0 lg:border-r"
        >
          <button
            type="button"
            onClick={() => setView("cards")}
            aria-current={view === "cards" ? "page" : undefined}
            className={clsx(
              "mb-4 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
              view === "cards"
                ? "bg-[var(--navy-dark)] text-white"
                : "text-[var(--navy-dark)] hover:bg-white",
            )}
          >
            My cards
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Boards
          </p>
          {boards?.map((board) => (
            <button
              key={board.id}
              type="button"
              onClick={() => selectBoard(board.id)}
              aria-current={
                view === "board" && board.id === openBoard?.id
                  ? "page"
                  : undefined
              }
              className={clsx(
                "truncate rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                view === "board" && board.id === openBoard?.id
                  ? "bg-[var(--navy-dark)] text-white"
                  : "text-[var(--navy-dark)] hover:bg-white",
              )}
            >
              <span className="block truncate">{board.name}</span>
              {board.role === "member" && (
                <span
                  className={clsx(
                    "block truncate text-xs font-medium",
                    view === "board" && board.id === openBoard?.id
                      ? "text-white/70"
                      : "text-[var(--gray-text)]",
                  )}
                >
                  Shared by {board.owner}
                </span>
              )}
            </button>
          ))}
          {isCreating ? (
            <form onSubmit={handleCreateBoard} className="mt-2 space-y-2">
              <input
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="Board name"
                aria-label="New board name"
                maxLength={80}
                autoFocus
                className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewBoardName("");
                  }}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="mt-2 rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
            >
              New board
            </button>
          )}
        </nav>

        <div className="min-w-0 flex-1 px-6 pb-16 pt-8">
          {error && (
            <p
              role="alert"
              className="mb-6 rounded-2xl border border-[var(--secondary-purple)] bg-white px-5 py-3 text-sm font-medium text-[var(--secondary-purple)]"
            >
              {error}
            </p>
          )}
          {view === "cards" ? (
            <MyCards
              onOpenBoard={selectBoard}
              onSessionExpired={handleSessionExpired}
            />
          ) : view === "account" ? (
            <AccountSettings
              onClose={() => setView("board")}
              onAccountDeleted={() => onSignedOut("Your account was deleted.")}
              onSessionExpired={handleSessionExpired}
            />
          ) : openBoard && openSummary ? (
            <KanbanBoard
              key={openBoard.id}
              boardId={openBoard.id}
              name={openSummary.name}
              initialBoard={openBoard.data}
              initialEtag={openBoard.etag}
              initialMembers={openBoard.members}
              initialCommentCounts={openBoard.commentCounts}
              role={openSummary.role}
              username={user.username}
              onRename={(name) => handleRenameBoard(openBoard.id, name)}
              onDelete={() => handleDeleteBoard(openBoard.id)}
              onLeave={() => removeBoard(openBoard.id)}
              onSessionExpired={handleSessionExpired}
            />
          ) : (
            boards?.length === 0 && (
              <div className="rounded-3xl border border-dashed border-[var(--stroke)] bg-white/60 p-10 text-center">
                <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
                  No boards yet
                </h2>
                <p className="mt-2 text-sm text-[var(--gray-text)]">
                  Create a board from the sidebar to get started.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
