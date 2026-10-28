import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyCards } from "@/components/MyCards";
import { initialData } from "@/lib/kanban";
import { jsonResponse, mockApi } from "@/test/mockApi";

const item = (boardId: number, cardId: string, dueDate: string | null) => ({
  boardId,
  boardName: `Board ${boardId}`,
  columnTitle: "In Progress",
  card: { ...initialData.cards[cardId], dueDate, assignee: "alice" },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("MyCards", () => {
  it("lists cards with board, column, priority and due date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00"));
    mockApi({
      "GET /api/me/cards": () =>
        jsonResponse(200, [item(1, "card-5", "2026-11-10"), item(2, "card-4", null)]),
    });
    render(<MyCards onOpenBoard={vi.fn()} onSessionExpired={vi.fn()} />);
    const rows = await screen.findAllByTestId("my-card");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Design card layout");
    expect(rows[0]).toHaveTextContent("Board 1 · In Progress");
    expect(rows[0]).toHaveTextContent("high priority");
    expect(rows[0]).toHaveTextContent("Overdue: Nov 10, 2026");
    expect(rows[1]).not.toHaveTextContent("Due");
  });

  it("opens a card's board", async () => {
    mockApi({ "GET /api/me/cards": () => jsonResponse(200, [item(7, "card-1", null)]) });
    const onOpenBoard = vi.fn();
    render(<MyCards onOpenBoard={onOpenBoard} onSessionExpired={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open board" }));
    expect(onOpenBoard).toHaveBeenCalledWith(7);
  });

  it("shows an empty state", async () => {
    mockApi({ "GET /api/me/cards": () => jsonResponse(200, []) });
    render(<MyCards onOpenBoard={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(await screen.findByText("Nothing assigned to you right now.")).toBeInTheDocument();
  });

  it("reports failures and expired sessions", async () => {
    mockApi({ "GET /api/me/cards": () => jsonResponse(500, {}) });
    const { unmount } = render(<MyCards onOpenBoard={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your cards");
    unmount();

    mockApi({ "GET /api/me/cards": () => jsonResponse(401, {}) });
    const onSessionExpired = vi.fn();
    render(<MyCards onOpenBoard={vi.fn()} onSessionExpired={onSessionExpired} />);
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });
});
