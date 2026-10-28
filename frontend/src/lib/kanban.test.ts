import {
  boardStats,
  createId,
  formatDueDate,
  formatTimestamp,
  initialData,
  boardLabels,
  isOverdue,
  matchesFilter,
  parseChecklist,
  parseLabels,
  moveCard,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end when dropped on its own column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("returns columns unchanged for unknown ids", () => {
    expect(moveCard(baseColumns, "missing", "card-1")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });
});

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "card-x",
  title: "Write launch plan",
  details: "Outline channels and owners",
  priority: null,
  dueDate: null,
  labels: [],
  checklist: [],
  assignee: null,
  ...overrides,
});

describe("matchesFilter", () => {
  it("matches everything with an empty filter", () => {
    expect(matchesFilter(card(), { query: "  ", priority: "all", label: "", assignee: "" })).toBe(true);
  });

  it("matches title or details case-insensitively", () => {
    expect(matchesFilter(card(), { query: "LAUNCH", priority: "all", label: "", assignee: "" })).toBe(true);
    expect(matchesFilter(card(), { query: "owners", priority: "all", label: "", assignee: "" })).toBe(true);
    expect(matchesFilter(card(), { query: "budget", priority: "all", label: "", assignee: "" })).toBe(false);
  });

  it("matches priority", () => {
    expect(matchesFilter(card({ priority: "high" }), { query: "", priority: "high", label: "", assignee: "" })).toBe(true);
    expect(matchesFilter(card({ priority: "low" }), { query: "", priority: "high", label: "", assignee: "" })).toBe(false);
    expect(matchesFilter(card(), { query: "", priority: "low", label: "", assignee: "" })).toBe(false);
  });

  it("requires both query and priority to match", () => {
    const high = card({ priority: "high" });
    expect(matchesFilter(high, { query: "launch", priority: "high", label: "", assignee: "" })).toBe(true);
    expect(matchesFilter(high, { query: "budget", priority: "high", label: "", assignee: "" })).toBe(false);
  });
});

describe("label filtering", () => {
  const tagged = card({ labels: ["design", "ux"] });

  it("matches a selected label", () => {
    expect(matchesFilter(tagged, { query: "", priority: "all", label: "ux", assignee: "" })).toBe(true);
    expect(matchesFilter(tagged, { query: "", priority: "all", label: "ops", assignee: "" })).toBe(false);
  });

  it("searches labels too", () => {
    expect(matchesFilter(tagged, { query: "DESIGN", priority: "all", label: "", assignee: "" })).toBe(true);
  });
});

describe("assignee filtering", () => {
  it("matches the selected assignee only", () => {
    const filter = { query: "", priority: "all" as const, label: "", assignee: "bob" };
    expect(matchesFilter(card({ assignee: "bob" }), filter)).toBe(true);
    expect(matchesFilter(card({ assignee: "ann" }), filter)).toBe(false);
    expect(matchesFilter(card(), filter)).toBe(false);
  });
});

describe("parseLabels", () => {
  it("trims, drops empties and duplicates", () => {
    expect(parseLabels(" design, ,research,design ")).toEqual(["design", "research"]);
    expect(parseLabels("")).toEqual([]);
  });

  it("caps labels at 30 characters", () => {
    expect(parseLabels("x".repeat(40))).toEqual(["x".repeat(30)]);
  });
});

describe("parseChecklist", () => {
  const existing = [
    { id: "item-1", text: "Write", done: true },
    { id: "item-2", text: "Review", done: false },
  ];

  it("keeps ids and ticks of unchanged lines and adds new ones", () => {
    const result = parseChecklist("Review\n\n  Write \nShip", existing);
    expect(result.slice(0, 2)).toEqual([existing[1], existing[0]]);
    expect(result[2]).toMatchObject({ text: "Ship", done: false });
    expect(result[2].id).toMatch(/^item-/);
  });

  it("reuses an existing item only once", () => {
    const result = parseChecklist("Write\nWrite", existing);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1].id).not.toBe("item-1");
    expect(result[1].done).toBe(false);
  });

  it("returns an empty list for blank text", () => {
    expect(parseChecklist("  \n ", existing)).toEqual([]);
  });
});

describe("boardLabels", () => {
  it("lists unique labels sorted", () => {
    expect(boardLabels(initialData)).toEqual(["design", "research", "strategy"]);
  });
});

describe("isOverdue", () => {
  it("is overdue only before today", () => {
    expect(isOverdue(card({ dueDate: "2026-11-01" }), "2026-11-02")).toBe(true);
    expect(isOverdue(card({ dueDate: "2026-11-02" }), "2026-11-02")).toBe(false);
    expect(isOverdue(card(), "2026-11-02")).toBe(false);
  });
});

describe("boardStats", () => {
  it("counts cards, open high priority and overdue cards", () => {
    expect(boardStats(initialData, "2026-11-15")).toEqual({
      total: 8,
      highPriority: 2,
      overdue: 1,
    });
  });

  it("ignores cards in the last column", () => {
    const board = {
      ...initialData,
      columns: initialData.columns.map((column) =>
        column.id === "col-done"
          ? { ...column, cardIds: [...column.cardIds, "card-5"] }
          : { ...column, cardIds: column.cardIds.filter((id) => id !== "card-5") },
      ),
    };
    expect(boardStats(board, "2026-11-15")).toEqual({ total: 8, highPriority: 1, overdue: 0 });
  });
});

describe("formatDueDate", () => {
  it("formats an ISO date without timezone shifts", () => {
    expect(formatDueDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("formatTimestamp", () => {
  it("reads server timestamps as UTC", () => {
    const shown = formatTimestamp("2026-10-01 09:30:00");
    const expected = new Date(Date.UTC(2026, 9, 1, 9, 30)).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(shown).toBe(expected);
  });
});

describe("createId", () => {
  it("uses the prefix and is unique", () => {
    const first = createId("col");
    expect(first).toMatch(/^col-/);
    expect(createId("col")).not.toBe(first);
  });
});
