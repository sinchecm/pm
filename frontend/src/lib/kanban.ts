export type Priority = "low" | "medium" | "high";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null; // YYYY-MM-DD
  labels: string[];
  checklist: ChecklistItem[];
  assignee: string | null; // a board member's username
};

export type Comment = {
  id: number;
  cardId: string;
  author: string;
  text: string;
  createdAt: string; // UTC, "YYYY-MM-DD HH:MM:SS"
};

export type MyCard = {
  boardId: number;
  boardName: string;
  columnTitle: string;
  card: Card;
};

export type CardFields = Omit<Card, "id">;

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export type Role = "owner" | "member";

export type BoardSummary = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
  role: Role;
};

export type Member = {
  username: string;
  role: Role;
};

export type User = {
  id: number;
  username: string;
};

export type CardFilter = {
  query: string;
  priority: Priority | "all";
  label: string; // "" for any label
  assignee: string; // "" for anyone
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      dueDate: "2026-11-20",
      labels: ["strategy"],
      checklist: [
        { id: "item-1", text: "Collect team input", done: true },
        { id: "item-2", text: "Draft impact statements", done: false },
        { id: "item-3", text: "Review with leadership", done: false },
      ],
      assignee: null,
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "medium",
      dueDate: null,
      labels: ["research"],
      checklist: [],
      assignee: null,
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "medium",
      dueDate: "2026-12-05",
      labels: ["design", "research"],
      checklist: [],
      assignee: null,
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "low",
      dueDate: null,
      labels: [],
      checklist: [],
      assignee: null,
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "high",
      dueDate: "2026-11-12",
      labels: ["design"],
      checklist: [],
      assignee: null,
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "medium",
      dueDate: null,
      labels: [],
      checklist: [
        { id: "item-4", text: "Hover states", done: true },
        { id: "item-5", text: "Loading states", done: false },
      ],
      assignee: null,
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: null,
      dueDate: null,
      labels: [],
      checklist: [],
      assignee: null,
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: "low",
      dueDate: null,
      labels: [],
      checklist: [],
      assignee: null,
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

// Local date as YYYY-MM-DD, comparable with card due dates as strings
export const todayIso = () => new Date().toLocaleDateString("en-CA");

export const isOverdue = (card: Card, today: string) =>
  card.dueDate !== null && card.dueDate < today;

export const matchesFilter = (card: Card, filter: CardFilter) => {
  const query = filter.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    [card.title, card.details, ...card.labels].some((text) =>
      text.toLowerCase().includes(query),
    );
  return (
    matchesQuery &&
    (filter.priority === "all" || card.priority === filter.priority) &&
    (!filter.label || card.labels.includes(filter.label)) &&
    (!filter.assignee || card.assignee === filter.assignee)
  );
};

// "design, research, design" -> ["design", "research"]
export const parseLabels = (text: string) => [
  ...new Set(
    text
      .split(",")
      .map((label) => label.trim().slice(0, 30))
      .filter(Boolean),
  ),
];

// One item per line; a line matching an existing item keeps its id and tick (each item once)
export const parseChecklist = (
  text: string,
  existing: ChecklistItem[],
): ChecklistItem[] => {
  const unused = [...existing];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = unused.findIndex((item) => item.text === line);
      return index === -1
        ? { id: createId("item"), text: line, done: false }
        : unused.splice(index, 1)[0];
    });
};

export const boardLabels = (board: BoardData) =>
  [...new Set(Object.values(board.cards).flatMap((card) => card.labels))].sort();

// The last column counts as done, so its cards are never overdue
export const boardStats = (board: BoardData, today: string) => {
  const doneIds = new Set(board.columns.at(-1)?.cardIds);
  const cards = Object.values(board.cards);
  return {
    total: cards.length,
    highPriority: cards.filter(
      (card) => card.priority === "high" && !doneIds.has(card.id),
    ).length,
    overdue: cards.filter(
      (card) => isOverdue(card, today) && !doneIds.has(card.id),
    ).length,
  };
};

export const formatDueDate = (dueDate: string) =>
  new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// Server timestamps are UTC without a zone; shown in local time
export const formatTimestamp = (timestamp: string) =>
  new Date(`${timestamp.replace(" ", "T")}Z`).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
