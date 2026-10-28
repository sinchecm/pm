import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardComments, type CommentsContext } from "@/components/CardComments";
import {
  PRIORITIES,
  formatDueDate,
  parseChecklist,
  parseLabels,
  type Card,
  type CardFields,
  type Priority,
} from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  isOverdue: boolean;
  assignees: string[];
  commentCount: number;
  comments: CommentsContext;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, fields: CardFields) => void;
};

const priorityStyles: Record<Priority, string> = {
  high: "bg-[var(--secondary-purple)] text-white",
  medium: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  low: "bg-[var(--surface)] text-[var(--gray-text)]",
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const KanbanCard = ({
  card,
  isOverdue,
  assignees,
  commentCount,
  comments,
  onDelete,
  onEdit,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate);
  const [assignee, setAssignee] = useState(card.assignee);
  const [labelsText, setLabelsText] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setPriority(card.priority);
    setDueDate(card.dueDate);
    setAssignee(card.assignee);
    setLabelsText(card.labels.join(", "));
    setChecklistText(card.checklist.map((item) => item.text).join("\n"));
    setIsEditing(true);
  };

  const toggleItem = (itemId: string) =>
    onEdit(card.id, {
      ...card,
      checklist: card.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      ),
    });
  const doneCount = card.checklist.filter((item) => item.done).length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onEdit(card.id, {
      title: title.trim(),
      details: details.trim(),
      priority,
      dueDate,
      assignee,
      labels: parseLabels(labelsText),
      checklist: parseChecklist(checklistText, card.checklist),
    });
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
      )}
      {...(isEditing || isCommentsOpen ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            aria-label="Card title"
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
            aria-label="Card details"
          />
          <div className="flex gap-2">
            <select
              value={priority ?? ""}
              onChange={(event) =>
                setPriority((event.target.value || null) as Priority | null)
              }
              aria-label="Priority"
              className={fieldClass}
            >
              <option value="">No priority</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {capitalize(value)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate ?? ""}
              onChange={(event) => setDueDate(event.target.value || null)}
              aria-label="Due date"
              className={fieldClass}
            />
          </div>
          <select
            value={assignee ?? ""}
            onChange={(event) => setAssignee(event.target.value || null)}
            aria-label="Assignee"
            className={fieldClass}
          >
            <option value="">Unassigned</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            value={labelsText}
            onChange={(event) => setLabelsText(event.target.value)}
            placeholder="Labels, separated by commas"
            aria-label="Labels"
            className={fieldClass}
          />
          <textarea
            value={checklistText}
            onChange={(event) => setChecklistText(event.target.value)}
            placeholder="Checklist, one item per line"
            rows={3}
            aria-label="Checklist"
            className={clsx(fieldClass, "resize-none")}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
          {card.labels.length > 0 && (
            <ul aria-label="Labels" className="mt-3 flex flex-wrap gap-1">
              {card.labels.map((label) => (
                <li
                  key={label}
                  className="rounded-full bg-[rgba(32,157,215,0.12)] px-2 py-0.5 text-xs font-semibold text-[var(--primary-blue)]"
                >
                  {label}
                </li>
              ))}
            </ul>
          )}
          {card.checklist.length > 0 && (
            <div className="mt-3">
              <p
                data-testid="checklist-progress"
                className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Checklist {doneCount}/{card.checklist.length}
              </p>
              <ul className="mt-1 space-y-1">
                {card.checklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-start gap-2 text-sm text-[var(--navy-dark)]">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 accent-[var(--secondary-purple)]"
                      />
                      <span
                        className={clsx(
                          item.done && "text-[var(--gray-text)] line-through",
                        )}
                      >
                        {item.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(card.priority || card.dueDate || card.assignee) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              {card.assignee && (
                <span
                  data-testid="assignee"
                  className="flex items-center gap-1 rounded-full border border-[var(--stroke)] py-0.5 pl-0.5 pr-2 text-[var(--navy-dark)]"
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--navy-dark)] text-[10px] uppercase text-white"
                  >
                    {card.assignee[0]}
                  </span>
                  {card.assignee}
                </span>
              )}
              {card.priority && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-1",
                    priorityStyles[card.priority],
                  )}
                >
                  {capitalize(card.priority)} priority
                </span>
              )}
              {card.dueDate && (
                <span
                  data-testid="due-date"
                  className={clsx(
                    "rounded-full border px-2 py-1",
                    isOverdue
                      ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
                      : "border-[var(--stroke)] text-[var(--gray-text)]",
                  )}
                >
                  {isOverdue ? "Overdue: " : "Due "}
                  {formatDueDate(card.dueDate)}
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setIsCommentsOpen((open) => !open)}
              aria-expanded={isCommentsOpen}
              className="mr-auto rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Comments on ${card.title}`}
            >
              {commentCount === 1 ? "1 comment" : `${commentCount} comments`}
            </button>
            <button
              type="button"
              onClick={startEditing}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--stroke)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Delete ${card.title}`}
            >
              Remove
            </button>
          </div>
          {isCommentsOpen && <CardComments {...comments} cardId={card.id} />}
        </div>
      )}
    </article>
  );
};
