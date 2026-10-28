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

const renderBoard = (onLogout = vi.fn()) =>
  render(<KanbanBoard initialBoard={initialData} onLogout={onLogout} />);

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

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

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
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
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
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(card).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("does not add a card without a title", async () => {
    renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
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
    await vi.waitFor(() => expect(lastSavedBoard().columns[0].title).toBe("Ideas"));
  });

  it("saves an added card", async () => {
    renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Saved card");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

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

    await vi.waitFor(() => expect(lastSavedBoard().cards["card-1"].title).toBe("Edited"));
  });

  it("saves a removed card", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));

    await vi.waitFor(() => {
      const saved = lastSavedBoard();
      expect(saved.cards["card-1"]).toBeUndefined();
      expect(saved.columns[0].cardIds).toEqual(["card-2"]);
    });
  });
});
