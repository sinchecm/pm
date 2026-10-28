import { useEffect, useState } from "react";
import clsx from "clsx";
import { isUnauthorized, request } from "@/lib/api";
import { formatDueDate, isOverdue, todayIso, type MyCard } from "@/lib/kanban";

type MyCardsProps = {
  onOpenBoard: (boardId: number) => void;
  onSessionExpired: () => void;
};

// Open cards assigned to the user across all boards, soonest due first
export const MyCards = ({ onOpenBoard, onSessionExpired }: MyCardsProps) => {
  const [cards, setCards] = useState<MyCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    request<MyCard[]>("/api/me/cards").then(setCards, (caught) => {
      if (isUnauthorized(caught)) {
        onSessionExpired();
      } else {
        setError("Could not load your cards. Please try again.");
      }
    });
  }, [onSessionExpired]);

  const today = todayIso();

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
          My cards
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          Open cards assigned to you on all your boards, soonest due first.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
      {cards?.length === 0 && (
        <p className="rounded-3xl border border-dashed border-[var(--stroke)] bg-white/60 p-10 text-center text-sm text-[var(--gray-text)]">
          Nothing assigned to you right now.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {cards?.map(({ boardId, boardName, columnTitle, card }) => (
          <li
            key={`${boardId}-${card.id}`}
            data-testid="my-card"
            className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
          >
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-[var(--gray-text)]">
                {boardName} &middot; {columnTitle}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                {card.priority && (
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 capitalize text-[var(--navy-dark)]">
                    {card.priority} priority
                  </span>
                )}
                {card.dueDate && (
                  <span
                    className={clsx(
                      "rounded-full border px-2 py-1",
                      isOverdue(card, today)
                        ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
                        : "border-[var(--stroke)] text-[var(--gray-text)]",
                    )}
                  >
                    {isOverdue(card, today) ? "Overdue: " : "Due "}
                    {formatDueDate(card.dueDate)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenBoard(boardId)}
              className="shrink-0 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
            >
              Open board
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
