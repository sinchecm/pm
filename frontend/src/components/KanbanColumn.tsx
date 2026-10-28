import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { isOverdue, type Card, type CardFields, type Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import type { CommentsContext } from "@/components/CardComments";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  today: string;
  assignees: string[];
  commentCounts: Record<string, number>;
  comments: CommentsContext;
  isDone: boolean;
  canDelete: boolean;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, fields: CardFields) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  today,
  assignees,
  commentCounts,
  comments,
  isDone,
  canDelete,
  onRename,
  onDelete,
  onAddCard,
  onDeleteCard,
  onEditCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] min-w-[220px] max-w-[360px] flex-1 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                {cards.length} cards
              </span>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(column.id)}
                className="rounded-full px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                aria-label={`Delete column ${column.title}`}
              >
                Remove
              </button>
            )}
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isOverdue={!isDone && isOverdue(card, today)}
              assignees={assignees}
              commentCount={commentCounts[card.id] ?? 0}
              comments={comments}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
