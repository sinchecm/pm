import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const fetchMock = vi.fn(async () => new Response("{}"));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderBoard = (onLogout = vi.fn(), onSessionExpired = vi.fn()) =>
  render(
    <KanbanBoard
      initialBoard={initialData}
      onLogout={onLogout}
      onSessionExpired={onSessionExpired}
    />,
  );

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
  expect(url).toBe("/api/board");
  expect(init.method).toBe("PUT");
  return JSON.parse(init.body as string);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
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

  it("calls onLogout from the header button", async () => {
    const onLogout = vi.fn();
    renderBoard(onLogout);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
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
      "/api/chat",
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

  it("reports an expired session when a save returns 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const onSessionExpired = vi.fn();
    renderBoard(vi.fn(), onSessionExpired);

    await typeInFirstColumnTitle("Z");
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });
});
