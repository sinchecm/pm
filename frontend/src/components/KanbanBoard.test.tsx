import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData, type Member, type Role } from "@/lib/kanban";

const fetchMock = vi.fn(async () => new Response("{}"));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderBoard = ({
  board = initialData,
  etag = null as string | null,
  role = "owner" as Role,
  members = [{ username: "alice", role: "owner" }] as Member[],
  commentCounts = {} as Record<string, number>,
  onRename = vi.fn(),
  onDelete = vi.fn(),
  onLeave = vi.fn(),
  onSessionExpired = vi.fn(),
} = {}) =>
  render(
    <KanbanBoard
      boardId={3}
      name="My Board"
      initialBoard={board}
      initialEtag={etag}
      initialMembers={members}
      initialCommentCounts={commentCounts}
      role={role}
      username="alice"
      onRename={onRename}
      onDelete={onDelete}
      onLeave={onLeave}
      onSessionExpired={onSessionExpired}
    />,
  );

const withEtag = (etag: string, body: unknown = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ETag: etag } });

const putCalls = () =>
  (fetchMock.mock.calls as unknown as [string, RequestInit][]).filter(
    ([, init]) => init?.method === "PUT",
  );

const cardsIn = (columnId: string) =>
  within(screen.getByTestId(`column-${columnId}`)).queryAllByTestId(/^card-card/);

// Appends to the first column title: one keystroke, one save
const typeInFirstColumnTitle = async (text: string) => {
  await userEvent.type(
    within(getFirstColumn()).getByLabelText("Column title"),
    text,
  );
};

const lastSavedBoard = (): BoardData => {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const [url, init] = calls[calls.length - 1];
  expect(url).toBe("/api/boards/3");
  expect(init.method).toBe("PUT");
  return JSON.parse(init.body as string);
};

const getFirstColumn = () => screen.getAllByTestId(/^column-/)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    renderBoard();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("renames a column", async () => {
    renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i }),
    );

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i }),
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Updated details")).toBeInTheDocument();
    expect(within(card).queryByLabelText("Card title")).not.toBeInTheDocument();
  });

  it("cancels editing a card without changes", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i }),
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(
      within(card).getByRole("button", { name: /cancel/i }),
    );

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(card).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("does not add a card without a title", async () => {
    renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i }),
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i }),
    );
    expect(within(column).getAllByTestId(/^card-/)).toHaveLength(2);
  });

  it("renames the board on blur and on Enter", async () => {
    const onRename = vi.fn();
    renderBoard({ onRename });
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Roadmap{Enter}");
    expect(onRename).toHaveBeenCalledWith("Roadmap");
    expect(input).toHaveValue("Roadmap");
  });

  it("does not rename to an empty or unchanged name", async () => {
    const onRename = vi.fn();
    renderBoard({ onRename });
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue("My Board");
    await userEvent.click(input);
    await userEvent.tab();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("calls onDelete from the header button", async () => {
    const onDelete = vi.fn();
    renderBoard({ onDelete });
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("adds a column and saves it", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(6);
    await vi.waitFor(() => {
      const saved = lastSavedBoard();
      expect(saved.columns).toHaveLength(6);
      expect(saved.columns[5]).toMatchObject({ title: "New column", cardIds: [] });
    });
  });

  it("deletes an empty column without confirming", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const board: BoardData = {
      ...initialData,
      columns: [...initialData.columns, { id: "col-empty", title: "Empty", cardIds: [] }],
    };
    renderBoard({ board });
    await userEvent.click(screen.getByRole("button", { name: "Delete column Empty" }));
    expect(screen.queryByTestId("column-col-empty")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("deletes a column with its cards after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete column Backlog" }));
    expect(window.confirm).toHaveBeenCalledWith('Delete "Backlog" and its 2 cards?');
    await vi.waitFor(() => {
      const saved = lastSavedBoard();
      expect(saved.columns.map((column) => column.id)).not.toContain("col-backlog");
      expect(saved.cards["card-1"]).toBeUndefined();
      expect(saved.cards["card-2"]).toBeUndefined();
    });
  });

  it("keeps a column when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete column Backlog" }));
    expect(screen.getByTestId("column-col-backlog")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not offer to delete the last column", () => {
    renderBoard({ board: { columns: [initialData.columns[0]], cards: initialData.cards } });
    expect(screen.queryByRole("button", { name: /delete column/i })).not.toBeInTheDocument();
  });

  it("filters cards by search text", async () => {
    renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
    expect(cardsIn("col-backlog")).toHaveLength(1);
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-5")).not.toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    renderBoard();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(screen.getAllByTestId(/^card-card/).map((card) => card.dataset.testid)).toEqual([
      "card-card-1",
      "card-card-5",
    ]);
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "all");
    expect(screen.getAllByTestId(/^card-card/)).toHaveLength(8);
  });

  it("shows board stats", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00"));
    renderBoard();
    // card-5 (high, due Nov 12) is overdue; card-1 (high, due Nov 20) is not
    expect(screen.getByTestId("board-stats")).toHaveTextContent(
      "8 cards·2 high priority·1 overdue",
    );
    expect(within(screen.getByTestId("card-card-5")).getByTestId("due-date")).toHaveTextContent(
      "Overdue: Nov 12, 2026",
    );
    expect(within(screen.getByTestId("card-card-1")).getByTestId("due-date")).toHaveTextContent(
      "Due Nov 20, 2026",
    );
    vi.useRealTimers();
  });

  it("shows priority badges", () => {
    renderBoard();
    expect(within(screen.getByTestId("card-card-1")).getByText("High priority")).toBeInTheDocument();
    expect(within(screen.getByTestId("card-card-7")).queryByText(/priority/)).not.toBeInTheDocument();
  });

  it("edits priority and due date", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-7");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    await userEvent.selectOptions(within(card).getByLabelText("Priority"), "medium");
    await userEvent.type(within(card).getByLabelText("Due date"), "2027-01-15");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByText("Medium priority")).toBeInTheDocument();
    expect(within(card).getByTestId("due-date")).toHaveTextContent("Jan 15, 2027");
    await vi.waitFor(() =>
      expect(lastSavedBoard().cards["card-7"]).toMatchObject({
        priority: "medium",
        dueDate: "2027-01-15",
      }),
    );
  });

  it("shows labels and checklist progress", () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByRole("list", { name: "Labels" })).toHaveTextContent("strategy");
    expect(within(card).getByTestId("checklist-progress")).toHaveTextContent("Checklist 1/3");
    expect(within(card).getByLabelText("Collect team input")).toBeChecked();
    expect(within(screen.getByTestId("card-card-7")).queryByTestId("checklist-progress")).toBeNull();
  });

  it("ticks a checklist item without opening the editor and saves it", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByLabelText("Draft impact statements"));

    expect(within(card).getByTestId("checklist-progress")).toHaveTextContent("2/3");
    await vi.waitFor(() =>
      expect(lastSavedBoard().cards["card-1"].checklist[1]).toEqual({
        id: "item-2",
        text: "Draft impact statements",
        done: true,
      }),
    );
    expect(lastSavedBoard().cards["card-1"].title).toBe("Align roadmap themes");
  });

  it("edits labels and checklist", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    expect(within(card).getByLabelText("Labels")).toHaveValue("strategy");
    const labels = within(card).getByLabelText("Labels");
    await userEvent.clear(labels);
    await userEvent.type(labels, "strategy, q1");
    const checklist = within(card).getByLabelText("Checklist");
    await userEvent.clear(checklist);
    await userEvent.type(checklist, "Collect team input{Enter}Book the room");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByTestId("checklist-progress")).toHaveTextContent("1/2");
    await vi.waitFor(() => {
      const saved = lastSavedBoard().cards["card-1"];
      expect(saved.labels).toEqual(["strategy", "q1"]);
      expect(saved.checklist.map((item) => [item.text, item.done])).toEqual([
        ["Collect team input", true],
        ["Book the room", false],
      ]);
    });
  });

  it("filters cards by label", async () => {
    renderBoard();
    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "design");
    expect(screen.getAllByTestId(/^card-card/).map((card) => card.dataset.testid)).toEqual([
      "card-card-3",
      "card-card-5",
    ]);
  });

  it("hides the label filter when no card has labels", () => {
    const board: BoardData = {
      columns: [{ id: "col-a", title: "A", cardIds: [] }],
      cards: {},
    };
    renderBoard({ board });
    expect(screen.queryByLabelText("Filter by label")).not.toBeInTheDocument();
  });

  it("clears priority and due date", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    await userEvent.selectOptions(within(card).getByLabelText("Priority"), "");
    await userEvent.clear(within(card).getByLabelText("Due date"));
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(lastSavedBoard().cards["card-1"]).toMatchObject({
        priority: null,
        dueDate: null,
      }),
    );
  });

  it("does not save on first render", () => {
    renderBoard();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a renamed column", async () => {
    renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas");
    await vi.waitFor(() =>
      expect(lastSavedBoard().columns[0].title).toBe("Ideas"),
    );
  });

  it("saves an added card", async () => {
    renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i }),
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Saved card",
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i }),
    );

    await vi.waitFor(() => {
      const saved = lastSavedBoard();
      const newId = saved.columns[0].cardIds[2];
      expect(saved.cards[newId].title).toBe("Saved card");
    });
  });

  it("saves an edited card", async () => {
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(lastSavedBoard().cards["card-1"].title).toBe("Edited"),
    );
  });

  it("saves a removed card", async () => {
    renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: /delete align roadmap themes/i }),
    );

    await vi.waitFor(() => {
      const saved = lastSavedBoard();
      expect(saved.cards["card-1"]).toBeUndefined();
      expect(saved.columns[0].cardIds).toEqual(["card-2"]);
    });
  });

  it("opens the AI assistant and applies a board returned by the AI without re-saving it", async () => {
    const aiBoard: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-ai-1": {
          id: "card-ai-1",
          title: "From the AI",
          details: "Added by chat",
          priority: null,
          dueDate: null,
          labels: [],
          checklist: [],
          assignee: null,
        },
      },
      columns: initialData.columns.map((column) =>
        column.id === "col-review"
          ? { ...column, cardIds: [...column.cardIds, "card-ai-1"] }
          : column,
      ),
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "Added it.", board: aiBoard })),
    );
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: /ai assistant/i }),
    );
    await userEvent.type(screen.getByLabelText("Message"), "Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    const review = await screen.findByTestId("column-col-review");
    expect(await within(review).findByText("From the AI")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/boards/3/chat",
    );

    await userEvent.click(
      screen.getByRole("button", { name: /close ai assistant/i }),
    );
    expect(screen.getByLabelText("Message")).not.toBeVisible();
  });

  it("keeps the conversation when the assistant is closed and reopened", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "Hello there", board: null })),
    );
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Hello there");

    await userEvent.click(
      screen.getByRole("button", { name: /close ai assistant/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    expect(screen.getByText("Hello there")).toBeVisible();
  });

  it("locks the board while the AI is working", async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => (respond = resolve)),
    );
    renderBoard();
    const boardArea = screen.getByTestId("board-area");
    expect(boardArea).not.toHaveAttribute("inert");

    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message"), "Change things");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(boardArea).toHaveAttribute("inert");
    expect(screen.getByText(/AI is updating your board/)).toBeInTheDocument();

    respond(new Response(JSON.stringify({ reply: "Done", board: null })));
    await screen.findByText("Done");
    expect(boardArea).not.toHaveAttribute("inert");
  });

  it("keeps saving after a failed save and clears the notice", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderBoard();

    await typeInFirstColumnTitle("A");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be saved/,
    );

    await userEvent.type(
      within(getFirstColumn()).getByLabelText("Column title"),
      "B",
    );
    await vi.waitFor(() =>
      expect(lastSavedBoard().columns[0].title).toBe("BacklogAB"),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("retries a failed save from the notice", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    renderBoard();

    await typeInFirstColumnTitle("X");
    await userEvent.click(
      await screen.findByRole("button", { name: /retry/i }),
    );

    await vi.waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(lastSavedBoard().columns[0].title).toBe("BacklogX");
  });

  it("sends If-Match with the latest ETag on each save", async () => {
    fetchMock.mockResolvedValueOnce(withEtag('"2"')).mockResolvedValueOnce(withEtag('"3"'));
    renderBoard({ etag: '"1"' });

    await typeInFirstColumnTitle("A");
    await vi.waitFor(() => expect(putCalls()).toHaveLength(1));
    await typeInFirstColumnTitle("B");
    await vi.waitFor(() => expect(putCalls()).toHaveLength(2));
    expect(putCalls().map(([, init]) => (init.headers as Record<string, string>)["If-Match"]))
      .toEqual(['"1"', '"2"']);
  });

  it("does not send If-Match without an ETag", async () => {
    renderBoard();
    await typeInFirstColumnTitle("A");
    await vi.waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][1].headers).not.toHaveProperty("If-Match");
  });

  it("loads the latest board after a conflict and drops the stale change", async () => {
    const latest: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Renamed elsewhere" } : column,
      ),
    };
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 412 }))
      .mockResolvedValueOnce(withEtag('"7"', latest))
      .mockResolvedValueOnce(withEtag('"8"'));
    renderBoard({ etag: '"1"' });

    await typeInFirstColumnTitle("!");
    expect(await screen.findByText(/changed by someone else/)).toBeInTheDocument();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue(
      "Renamed elsewhere",
    );
    expect((fetchMock.mock.calls as unknown as [string][])[1][0]).toBe("/api/boards/3");
    expect(putCalls()).toHaveLength(1);

    // The next edit builds on the latest board and its ETag, and clears the notice
    await typeInFirstColumnTitle("?");
    await vi.waitFor(() => expect(putCalls()).toHaveLength(2));
    expect((putCalls()[1][1].headers as Record<string, string>)["If-Match"]).toBe('"7"');
    expect(JSON.parse(putCalls()[1][1].body as string).columns[0].title).toBe(
      "Renamed elsewhere?",
    );
    expect(screen.queryByText(/changed by someone else/)).not.toBeInTheDocument();
  });

  it("uses the ETag of a board returned by the AI for the next save", async () => {
    fetchMock.mockResolvedValueOnce(
      withEtag('"4"', { reply: "Done", board: initialData }),
    );
    renderBoard({ etag: '"1"' });
    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
    await userEvent.type(screen.getByLabelText("Message"), "Tidy up");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Done");
    await userEvent.click(screen.getByRole("button", { name: /close ai assistant/i }));

    await typeInFirstColumnTitle("A");
    await vi.waitFor(() => expect(putCalls()).toHaveLength(1));
    expect((putCalls()[0][1].headers as Record<string, string>)["If-Match"]).toBe('"4"');
  });

  it("hides owner-only controls from members", () => {
    renderBoard({ role: "member" });
    expect(screen.queryByRole("button", { name: /delete board/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Members" })).toBeInTheDocument();
  });

  it("shows comment counts and updates them when a comment is posted", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 1, cardId: "card-1", author: "bob", text: "Old", createdAt: "2026-10-01 09:00:00" },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 2,
            cardId: "card-1",
            author: "alice",
            text: "New",
            createdAt: "2026-10-02 09:00:00",
          }),
          { status: 201 },
        ),
      );
    renderBoard({ commentCounts: { "card-1": 1 } });
    const card = screen.getByTestId("card-card-1");
    expect(within(screen.getByTestId("card-card-2")).getByText("0 comments")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Comments on Align roadmap themes" }));
    expect(await within(card).findByText("Old")).toBeInTheDocument();
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe(
      "/api/boards/3/cards/card-1/comments",
    );

    await userEvent.type(within(card).getByLabelText("New comment"), "New");
    await userEvent.click(within(card).getByRole("button", { name: "Post" }));
    expect(await within(card).findByText("2 comments")).toBeInTheDocument();
    // Comments live in their own table, so posting one does not save the board
    expect(putCalls()).toHaveLength(0);
  });

  it("does not start a drag from an open comments panel", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]"));
    renderBoard();
    const card = screen.getByTestId("card-card-1");
    expect(card).toHaveAttribute("aria-roledescription", "sortable");
    await userEvent.click(within(card).getByRole("button", { name: /comments on/i }));
    expect(card).not.toHaveAttribute("aria-roledescription");
  });

  it("toggles the members panel, refreshing the members when opened", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { username: "alice", role: "owner" },
          { username: "carol", role: "member" },
        ]),
      ),
    );
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getAllByTestId("member")[0]).toHaveTextContent("alice (you)");
    await vi.waitFor(() => expect(screen.getAllByTestId("member")).toHaveLength(2));
    expect(screen.getAllByTestId("member")[1]).toHaveTextContent("carol");
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe("/api/boards/3/members");

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.queryByTestId("member")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the known members if the refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("member")).toHaveTextContent("alice");
  });

  it("reports an expired session when refreshing members", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const onSessionExpired = vi.fn();
    renderBoard({ onSessionExpired });
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  const team: Member[] = [
    { username: "alice", role: "owner" },
    { username: "bob", role: "member" },
  ];

  it("assigns a card to a member", async () => {
    renderBoard({ members: team });
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    const select = within(card).getByLabelText("Assignee");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Unassigned",
      "alice",
      "bob",
    ]);
    await userEvent.selectOptions(select, "bob");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByTestId("assignee")).toHaveTextContent("bob");
    await vi.waitFor(() => expect(lastSavedBoard().cards["card-1"].assignee).toBe("bob"));
  });

  it("filters by assignee when the board has several members", async () => {
    const board: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-2": { ...initialData.cards["card-2"], assignee: "bob" },
        "card-4": { ...initialData.cards["card-4"], assignee: "alice" },
      },
    };
    renderBoard({ board, members: team });
    const filter = screen.getByLabelText("Filter by assignee");
    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Anyone",
      "Me",
      "bob",
    ]);
    await userEvent.selectOptions(filter, "bob");
    expect(screen.getAllByTestId(/^card-card/).map((c) => c.dataset.testid)).toEqual([
      "card-card-2",
    ]);
  });

  it("hides the assignee filter on a board with one member", () => {
    renderBoard();
    expect(screen.queryByLabelText("Filter by assignee")).not.toBeInTheDocument();
  });

  it("reloads the board after removing a member", async () => {
    const latest: BoardData = {
      ...initialData,
      cards: { ...initialData.cards, "card-1": { ...initialData.cards["card-1"], title: "Fresh" } },
    };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(team)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(withEtag('"6"', latest));
    renderBoard({ members: team });
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove bob" }));

    expect(await within(screen.getByTestId("card-card-1")).findByText("Fresh")).toBeInTheDocument();
    expect(screen.getAllByTestId("member")).toHaveLength(1);
    expect(screen.queryByLabelText("Filter by assignee")).not.toBeInTheDocument();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    expect(calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`)).toEqual([
      "GET /api/boards/3/members",
      "DELETE /api/boards/3/members/bob",
      "GET /api/boards/3",
    ]);
  });

  it("reports an expired session when a save returns 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const onSessionExpired = vi.fn();
    renderBoard({ onSessionExpired });

    await typeInFirstColumnTitle("Z");
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });
});
