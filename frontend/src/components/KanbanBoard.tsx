"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { BoardMembers } from "@/components/BoardMembers";
import { fetchBoard, hasStatus, isUnauthorized, request, send } from "@/lib/api";
import {
  PRIORITIES,
  boardLabels,
  boardStats,
  createId,
  matchesFilter,
  moveCard,
  todayIso,
  type BoardData,
  type CardFields,
  type CardFilter,
  type Member,
  type Priority,
  type Role,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: number;
  name: string;
  initialBoard: BoardData;
  initialEtag: string | null;
  initialMembers: Member[];
  initialCommentCounts: Record<string, number>;
  role: Role;
  username: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onLeave: () => void;
  onSessionExpired: () => void;
};

const CONFLICT_NOTICE =
  "This board was changed by someone else, so your last change was not saved. You are now seeing the latest version.";

const secondaryButton =
  "rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]";

export const KanbanBoard = ({
  boardId,
  name,
  initialBoard,
  initialEtag,
  initialMembers,
  initialCommentCounts,
  role,
  username,
  onRename,
  onDelete,
  onLeave,
  onSessionExpired,
}: KanbanBoardProps) => {
  const isOwner = role === "owner";
  const [board, setBoard] = useState<BoardData>(initialBoard);
  const [nameDraft, setNameDraft] = useState(name);
  const [filter, setFilter] = useState<CardFilter>({
    query: "",
    priority: "all",
    label: "",
    assignee: "",
  });
  const [members, setMembers] = useState(initialMembers);
  const [commentCounts, setCommentCounts] = useState(initialCommentCounts);
  const comments = {
    boardId,
    username,
    isOwner,
    onCountChange: (cardId: string, count: number) =>
      setCommentCounts((prev) => ({ ...prev, [cardId]: count })),
    onSessionExpired,
  };
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  // The board last stored on the server; saves run one at a time so the latest board wins
  const savedBoard = useRef(initialBoard);
  const saveQueue = useRef(Promise.resolve());
  // The server version our state is based on, sent as If-Match so we never overwrite others
  const etag = useRef(initialEtag);
  // Bumped on a conflict so saves queued from the stale board are dropped
  const generation = useRef(0);

  const loadLatest = useCallback(async () => {
    const latest = await fetchBoard<BoardData>(boardId);
    etag.current = latest.etag;
    savedBoard.current = latest.data;
    setBoard(latest.data);
  }, [boardId]);

  // Each save sends the whole board, so a successful later save also covers earlier failures
  const queueSave = useCallback(
    (next: BoardData) => {
      const queuedIn = generation.current;
      saveQueue.current = saveQueue.current
        .then(async () => {
          if (queuedIn !== generation.current) {
            return;
          }
          const response = await send(
            `/api/boards/${boardId}`,
            "PUT",
            next,
            etag.current ? { "If-Match": etag.current } : {},
          );
          etag.current = response.headers.get("ETag");
          setSaveFailed(false);
        })
        .catch(async (error) => {
          if (isUnauthorized(error)) {
            onSessionExpired();
          } else if (hasStatus(error, 412)) {
            generation.current += 1;
            setConflict(true);
            setSaveFailed(false);
            await loadLatest().catch(() => setSaveFailed(true));
          } else {
            setSaveFailed(true);
          }
        });
    },
    [boardId, loadLatest, onSessionExpired],
  );

  useEffect(() => {
    if (board === savedBoard.current) {
      return;
    }
    savedBoard.current = board;
    setConflict(false);
    queueSave(board);
  }, [board, queueSave]);

  // Opening the panel refreshes the members, which others may have changed
  const toggleMembers = () => {
    if (!isMembersOpen) {
      request<Member[]>(`/api/boards/${boardId}/members`).then(setMembers, (error) => {
        if (isUnauthorized(error)) {
          onSessionExpired();
        }
      });
    }
    setIsMembersOpen(!isMembersOpen);
  };

  // The chat endpoint has already saved boards it returns
  const handleAIBoardUpdate = (nextBoard: BoardData, nextEtag: string | null) => {
    etag.current = nextEtag;
    savedBoard.current = nextBoard;
    setBoard(nextBoard);
  };
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    setBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(name);
      return;
    }
    if (trimmed !== name) {
      onRename(trimmed);
    }
    setNameDraft(trimmed);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    }));
  };

  const handleAddColumn = () => {
    setBoard((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        { id: createId("col"), title: "New column", cardIds: [] },
      ],
    }));
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = board.columns.find((item) => item.id === columnId);
    if (
      !column ||
      (column.cardIds.length > 0 &&
        !window.confirm(
          `Delete "${column.title}" and its ${column.cardIds.length} cards?`,
        ))
    ) {
      return;
    }
    setBoard((prev) => ({
      columns: prev.columns.filter((item) => item.id !== columnId),
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(
          ([id]) => !column.cardIds.includes(id),
        ),
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: {
          id,
          title,
          details: details || "No details yet.",
          priority: null,
          dueDate: null,
          labels: [],
          checklist: [],
          assignee: null,
        },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column,
      ),
    }));
  };

  const handleEditCard = (cardId: string, fields: CardFields) => {
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...fields,
          id: cardId,
          details: fields.details || "No details yet.",
        },
      },
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId),
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column,
        ),
      };
    });
  };

  const today = todayIso();
  const stats = boardStats(board, today);
  const labels = boardLabels(board);
  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className={clsx("flex flex-col gap-6", isChatOpen && "sm:pr-[380px]")}>
      <header className="flex flex-col gap-5 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              maxLength={80}
              readOnly={!isOwner}
              aria-label="Board name"
              className="w-full bg-transparent font-display text-3xl font-semibold text-[var(--navy-dark)] outline-none"
            />
            <p
              data-testid="board-stats"
              className="mt-2 text-sm text-[var(--gray-text)]"
            >
              {stats.total} cards
              <span className="mx-2">&middot;</span>
              <span className="text-[var(--navy-dark)]">
                {stats.highPriority} high priority
              </span>
              <span className="mx-2">&middot;</span>
              <span
                className={clsx(
                  stats.overdue > 0 &&
                    "font-semibold text-[var(--secondary-purple)]",
                )}
              >
                {stats.overdue} overdue
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              AI Assistant
            </button>
            <button
              type="button"
              onClick={handleAddColumn}
              className={secondaryButton}
            >
              Add column
            </button>
            <button
              type="button"
              onClick={toggleMembers}
              aria-expanded={isMembersOpen}
              className={secondaryButton}
            >
              {isOwner ? "Share" : "Members"}
            </button>
            {isOwner && (
              <button type="button" onClick={onDelete} className={secondaryButton}>
                Delete board
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            value={filter.query}
            onChange={(event) =>
              setFilter((prev) => ({ ...prev, query: event.target.value }))
            }
            placeholder="Search cards"
            aria-label="Search cards"
            className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] sm:max-w-xs"
          />
          <select
            value={filter.priority}
            onChange={(event) =>
              setFilter((prev) => ({
                ...prev,
                priority: event.target.value as Priority | "all",
              }))
            }
            aria-label="Filter by priority"
            className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority[0].toUpperCase() + priority.slice(1)} priority
              </option>
            ))}
          </select>
          {members.length > 1 && (
            <select
              value={filter.assignee}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, assignee: event.target.value }))
              }
              aria-label="Filter by assignee"
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            >
              <option value="">Anyone</option>
              {members.map((member) => (
                <option key={member.username} value={member.username}>
                  {member.username === username ? "Me" : member.username}
                </option>
              ))}
            </select>
          )}
          {labels.length > 0 && (
            <select
              value={filter.label}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, label: event.target.value }))
              }
              aria-label="Filter by label"
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            >
              <option value="">All labels</option>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
        {isMembersOpen && (
          <BoardMembers
            boardId={boardId}
            role={role}
            username={username}
            members={members}
            onMembersChange={setMembers}
            onMemberRemoved={() => loadLatest().catch(() => setSaveFailed(true))}
            onLeave={onLeave}
            onSessionExpired={onSessionExpired}
          />
        )}
      </header>

      {conflict && (
        <p
          role="status"
          className="rounded-2xl border border-[var(--primary-blue)] bg-white px-5 py-3 text-sm font-medium text-[var(--primary-blue)]"
        >
          {CONFLICT_NOTICE}
        </p>
      )}

      {saveFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--secondary-purple)] bg-white px-5 py-3 text-sm font-medium text-[var(--secondary-purple)]"
        >
          Your latest changes could not be saved.
          <button
            type="button"
            onClick={() => queueSave(board)}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Retry
          </button>
        </div>
      )}
      {isAIWorking && (
        <p role="status" className="text-sm font-medium text-[var(--primary-blue)]">
          The AI is updating your board...
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Locked while the AI works, so its update can't overwrite edits made meanwhile */}
        <div
          inert={isAIWorking}
          aria-busy={isAIWorking}
          data-testid="board-area"
          className={clsx(
            "flex items-start gap-5 overflow-x-auto pb-4",
            isAIWorking && "opacity-60",
          )}
        >
          {board.columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={column.cardIds
                .map((cardId) => board.cards[cardId])
                .filter((card) => matchesFilter(card, filter))}
              today={today}
              assignees={members.map((member) => member.username)}
              commentCounts={commentCounts}
              comments={comments}
              isDone={index === board.columns.length - 1}
              canDelete={board.columns.length > 1}
              onRename={handleRenameColumn}
              onDelete={handleDeleteColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onEditCard={handleEditCard}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <div className="w-[260px]">
              <KanbanCardPreview card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <ChatSidebar
        boardId={boardId}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onBoardUpdate={handleAIBoardUpdate}
        onPendingChange={setIsAIWorking}
      />
    </div>
  );
};
