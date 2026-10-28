import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { initialData, type BoardData } from "@/lib/kanban";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

const summary = (id: number, name: string, owner = "alice") => ({
  id,
  name,
  createdAt: "2026-10-01 00:00:00",
  updatedAt: "2026-10-01 00:00:00",
  owner,
  role: owner === "alice" ? "owner" : "member",
});

const emptyBoard: BoardData = {
  columns: [{ id: "col-todo", title: "To do", cardIds: [] }],
  cards: {},
};

const owner = [{ username: "alice", role: "owner" }];
// Members and comment counts are fetched alongside each board
const membersRoutes = Object.fromEntries(
  [1, 2, 3, 4].flatMap((id) => [
    [`GET /api/boards/${id}/members`, () => jsonResponse(200, owner)],
    [`GET /api/boards/${id}/comment-counts`, () => jsonResponse(200, {})],
  ]),
);

const baseRoutes = () => ({
  ...membersRoutes,
  "GET /api/boards": () => jsonResponse(200, [summary(1, "My Board"), summary(2, "Launch")]),
  "GET /api/boards/1": () => jsonResponse(200, initialData),
  "GET /api/boards/2": () => jsonResponse(200, emptyBoard),
});

const renderWorkspace = (props: Partial<Parameters<typeof Workspace>[0]> = {}) =>
  render(
    <Workspace
      user={{ id: 1, username: "alice" }}
      onLogout={vi.fn()}
      onSignedOut={vi.fn()}
      {...props}
    />,
  );

const boardNav = () => within(screen.getByRole("navigation", { name: "Boards" }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

describe("Workspace", () => {
  it("lists boards and opens the first one", async () => {
    mockApi(baseRoutes());
    renderWorkspace();
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(screen.getByTestId("current-user")).toHaveTextContent("alice");
    expect(boardNav().getByRole("button", { name: "My Board" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByLabelText("Board name")).toHaveValue("My Board");
    expect(window.location.hash).toBe("#board-1");
  });

  it("opens the board named in the URL hash", async () => {
    history.replaceState(null, "", "#board-2");
    mockApi(baseRoutes());
    renderWorkspace();
    expect(await screen.findByTestId("column-col-todo")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveValue("Launch");
  });

  it("falls back to the first board for an unknown hash", async () => {
    history.replaceState(null, "", "#board-99");
    mockApi(baseRoutes());
    renderWorkspace();
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(window.location.hash).toBe("#board-1");
  });

  it("switches boards", async () => {
    mockApi(baseRoutes());
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(boardNav().getByRole("button", { name: "Launch" }));

    expect(await screen.findByTestId("column-col-todo")).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#board-2");
  });

  it("creates a board and opens it", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "POST /api/boards": () => jsonResponse(201, summary(3, "Hiring")),
      "GET /api/boards/3": () => jsonResponse(200, emptyBoard),
    });
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "  Hiring ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await boardNav().findByRole("button", { name: "Hiring" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(requestsTo(fetchMock, "POST", "/api/boards")).toEqual([{ name: "Hiring" }]);
    expect(screen.getByLabelText("Board name")).toHaveValue("Hiring");
  });

  it("ignores a blank new board name and can cancel", async () => {
    const fetchMock = mockApi(baseRoutes());
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(requestsTo(fetchMock, "POST", "/api/boards")).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
  });

  it("renames a board in the list", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "PATCH /api/boards/1": () => jsonResponse(200, summary(1, "Roadmap")),
    });
    renderWorkspace();
    const input = await screen.findByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Roadmap{Enter}");

    expect(await boardNav().findByRole("button", { name: "Roadmap" })).toBeInTheDocument();
    expect(requestsTo(fetchMock, "PATCH", "/api/boards/1")).toEqual([{ name: "Roadmap" }]);
  });

  it("deletes a board after confirming and opens the next one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi({ ...baseRoutes(), "DELETE /api/boards/1": () => jsonResponse(204) });
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Delete the board "My Board" and all its cards?',
    );
    expect(await screen.findByTestId("column-col-todo")).toBeInTheDocument();
    expect(boardNav().queryByRole("button", { name: "My Board" })).not.toBeInTheDocument();
  });

  it("keeps the board when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockApi(baseRoutes());
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(requestsTo(fetchMock, "DELETE", "/api/boards/1")).toEqual([]);
  });

  it("shows an empty state after deleting the last board", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi({
      ...membersRoutes,
      "GET /api/boards": () => jsonResponse(200, [summary(1, "Only")]),
      "GET /api/boards/1": () => jsonResponse(200, emptyBoard),
      "DELETE /api/boards/1": () => jsonResponse(204),
    });
    renderWorkspace();
    await screen.findByTestId("column-col-todo");
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(await screen.findByText("No boards yet")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("shows an error when a board fails to load", async () => {
    mockApi({ ...baseRoutes(), "GET /api/boards/1": () => jsonResponse(500, {}) });
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this board");
  });

  it("signs out when the session has expired", async () => {
    mockApi({ "GET /api/boards": () => jsonResponse(401, {}) });
    const onSignedOut = vi.fn();
    renderWorkspace({ onSignedOut });
    await vi.waitFor(() =>
      expect(onSignedOut).toHaveBeenCalledWith("Your session expired. Please sign in again."),
    );
  });

  it("opens account settings and goes back", async () => {
    mockApi(baseRoutes());
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /back to board/i }));
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("shows shared boards with their owner and member controls", async () => {
    mockApi({
      ...membersRoutes,
      "GET /api/boards": () =>
        jsonResponse(200, [summary(1, "My Board"), summary(4, "Team", "bob")]),
      "GET /api/boards/1": () => jsonResponse(200, initialData),
      "GET /api/boards/4": () => jsonResponse(200, emptyBoard),
      "GET /api/boards/4/members": () =>
        jsonResponse(200, [
          { username: "bob", role: "owner" },
          { username: "alice", role: "member" },
        ]),
    });
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    expect(boardNav().getByRole("button", { name: /Team/ })).toHaveTextContent("Shared by bob");
    expect(boardNav().getByRole("button", { name: "My Board" })).not.toHaveTextContent("Shared");

    await userEvent.click(boardNav().getByRole("button", { name: /Team/ }));
    await screen.findByTestId("column-col-todo");
    expect(screen.queryByRole("button", { name: /delete board/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByLabelText("Board name", { exact: true })).toHaveAttribute("readonly");
  });

  it("removes a board the user left and opens the next one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    history.replaceState(null, "", "#board-4");
    mockApi({
      ...membersRoutes,
      "GET /api/boards": () =>
        jsonResponse(200, [summary(1, "My Board"), summary(4, "Team", "bob")]),
      "GET /api/boards/1": () => jsonResponse(200, initialData),
      "GET /api/boards/4": () => jsonResponse(200, emptyBoard),
      "GET /api/boards/4/members": () =>
        jsonResponse(200, [
          { username: "bob", role: "owner" },
          { username: "alice", role: "member" },
        ]),
      "DELETE /api/boards/4/members/alice": () => jsonResponse(204),
    });
    renderWorkspace();
    await screen.findByTestId("column-col-todo");
    await userEvent.click(screen.getByRole("button", { name: "Members" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave board" }));

    expect(await screen.findAllByTestId(/^column-col-(backlog|discovery)/)).toHaveLength(2);
    expect(boardNav().queryByRole("button", { name: /Team/ })).not.toBeInTheDocument();
  });

  it("passes the board ETag to saves", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "GET /api/boards/1": () =>
        new Response(JSON.stringify(initialData), { headers: { ETag: '"5"' } }),
      "PUT /api/boards/1": () => jsonResponse(200, {}),
    });
    renderWorkspace();
    const [title] = await screen.findAllByLabelText("Column title");
    await userEvent.type(title, "!");
    await vi.waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put?.[1]?.headers).toMatchObject({ "If-Match": '"5"' });
    });
  });

  it("loads members only on open and Share, not on re-renders", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "PATCH /api/boards/1": () => jsonResponse(200, summary(1, "Renamed")),
    });
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByTestId("member");
    const input = screen.getByLabelText("Board name", { exact: true });
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    await boardNav().findByRole("button", { name: "Renamed" });
    expect(requestsTo(fetchMock, "GET", "/api/boards/1/members")).toHaveLength(2);
  });

  it("opens My cards and jumps to a card's board", async () => {
    mockApi({
      ...baseRoutes(),
      "GET /api/me/cards": () =>
        jsonResponse(200, [
          {
            boardId: 2,
            boardName: "Launch",
            columnTitle: "To do",
            card: { ...initialData.cards["card-1"], assignee: "alice" },
          },
        ]),
    });
    renderWorkspace();
    await screen.findAllByTestId(/^column-/);
    await userEvent.click(screen.getByRole("button", { name: "My cards" }));
    expect(screen.getByRole("button", { name: "My cards" })).toHaveAttribute("aria-current", "page");
    const item = await screen.findByTestId("my-card");
    expect(item).toHaveTextContent("Align roadmap themes");
    expect(item).toHaveTextContent("Launch · To do");

    await userEvent.click(within(item).getByRole("button", { name: "Open board" }));
    expect(await screen.findByTestId("column-col-todo")).toBeInTheDocument();
    expect(window.location.hash).toBe("#board-2");
  });

  it("passes comment counts to the board", async () => {
    mockApi({
      ...baseRoutes(),
      "GET /api/boards/1/comment-counts": () => jsonResponse(200, { "card-2": 3 }),
    });
    renderWorkspace();
    const card = await screen.findByTestId("card-card-2");
    expect(within(card).getByText("3 comments")).toBeInTheDocument();
  });

  it("calls onLogout", async () => {
    mockApi(baseRoutes());
    const onLogout = vi.fn();
    renderWorkspace({ onLogout });
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
