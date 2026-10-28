import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardComments } from "@/components/CardComments";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

const URL = "/api/boards/4/cards/card-1/comments";
const existing = [
  { id: 1, cardId: "card-1", author: "alice", text: "Mine", createdAt: "2026-10-01 09:00:00" },
  { id: 2, cardId: "card-1", author: "bob", text: "Theirs", createdAt: "2026-10-01 10:00:00" },
];

const renderComments = ({
  isOwner = false,
  onCountChange = vi.fn(),
  onSessionExpired = vi.fn(),
} = {}) =>
  render(
    <CardComments
      boardId={4}
      cardId="card-1"
      username="alice"
      isOwner={isOwner}
      onCountChange={onCountChange}
      onSessionExpired={onSessionExpired}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CardComments", () => {
  it("lists comments with author and text", async () => {
    mockApi({ [`GET ${URL}`]: () => jsonResponse(200, existing) });
    renderComments();
    const rows = await screen.findAllByTestId("comment");
    expect(rows[0]).toHaveTextContent("alice");
    expect(rows[0]).toHaveTextContent("Mine");
    expect(rows[1]).toHaveTextContent("Theirs");
  });

  it("shows an empty state", async () => {
    mockApi({ [`GET ${URL}`]: () => jsonResponse(200, []) });
    renderComments();
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("posts a comment and reports the new count", async () => {
    const fetchMock = mockApi({
      [`GET ${URL}`]: () => jsonResponse(200, existing),
      [`POST ${URL}`]: () =>
        jsonResponse(201, { ...existing[0], id: 3, text: "Another" }),
    });
    const onCountChange = vi.fn();
    renderComments({ onCountChange });
    await screen.findAllByTestId("comment");
    await userEvent.type(screen.getByLabelText("New comment"), "Another");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText("Another")).toBeInTheDocument();
    expect(onCountChange).toHaveBeenCalledWith("card-1", 3);
    expect(requestsTo(fetchMock, "POST", URL)).toEqual([{ text: "Another" }]);
    expect(screen.getByLabelText("New comment")).toHaveValue("");
  });

  it("ignores a blank comment", async () => {
    const fetchMock = mockApi({ [`GET ${URL}`]: () => jsonResponse(200, []) });
    renderComments();
    await userEvent.type(screen.getByLabelText("New comment"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(requestsTo(fetchMock, "POST", URL)).toEqual([]);
  });

  it("lets authors delete their own comments only", async () => {
    mockApi({
      [`GET ${URL}`]: () => jsonResponse(200, existing),
      "DELETE /api/boards/4/comments/1": () => jsonResponse(204),
    });
    const onCountChange = vi.fn();
    renderComments({ onCountChange });
    const [mine, theirs] = await screen.findAllByTestId("comment");
    expect(within(theirs).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(within(mine).getByRole("button", { name: "Delete comment by alice" }));

    await vi.waitFor(() => expect(screen.getAllByTestId("comment")).toHaveLength(1));
    expect(onCountChange).toHaveBeenCalledWith("card-1", 1);
  });

  it("lets the board owner delete any comment", async () => {
    mockApi({ [`GET ${URL}`]: () => jsonResponse(200, existing) });
    renderComments({ isOwner: true });
    await screen.findAllByTestId("comment");
    expect(screen.getAllByRole("button", { name: /delete comment/i })).toHaveLength(2);
  });

  it("reports failures", async () => {
    mockApi({
      [`GET ${URL}`]: () => jsonResponse(200, []),
      [`POST ${URL}`]: () => jsonResponse(500, {}),
    });
    renderComments();
    await userEvent.type(screen.getByLabelText("New comment"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not post the comment.");
    expect(screen.getByLabelText("New comment")).toHaveValue("Hello");
  });

  it("reports a failed load and an expired session", async () => {
    mockApi({ [`GET ${URL}`]: () => jsonResponse(500, {}) });
    const { unmount } = renderComments();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the comments.");
    unmount();

    mockApi({
      [`GET ${URL}`]: () => jsonResponse(200, existing),
      "DELETE /api/boards/4/comments/1": () => jsonResponse(401, {}),
    });
    const onSessionExpired = vi.fn();
    renderComments({ onSessionExpired });
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment by alice" }));
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });
});
