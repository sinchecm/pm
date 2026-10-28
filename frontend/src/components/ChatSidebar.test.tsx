import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { initialData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderSidebar = (
  onBoardUpdate = vi.fn(),
  onClose = vi.fn(),
  onPendingChange = vi.fn(),
) =>
  render(
    <ChatSidebar
      boardId={7}
      isOpen
      onBoardUpdate={onBoardUpdate}
      onClose={onClose}
      onPendingChange={onPendingChange}
    />,
  );

const send = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Message"), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

const sentBody = (callIndex: number) =>
  JSON.parse(fetchMock.mock.calls[callIndex][1].body as string);

describe("ChatSidebar", () => {
  it("shows the user message, a loading state, then the reply", async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => (respond = resolve)),
    );
    renderSidebar();

    await send("How many cards?");
    expect(screen.getByTestId("chat-message-user")).toHaveTextContent(
      "How many cards?",
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");

    respond(jsonResponse(200, { reply: "There are 8 cards.", board: null }));
    expect(
      await screen.findByTestId("chat-message-assistant"),
    ).toHaveTextContent("There are 8 cards.");
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("sends the conversation history with each message", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { reply: "First reply", board: null }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { reply: "Second reply", board: null }),
      );
    renderSidebar();

    await send("First");
    await screen.findByText("First reply");
    await send("Second");
    await screen.findByText("Second reply");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/boards/7/chat");
    expect(sentBody(0)).toEqual({ message: "First", history: [] });
    expect(sentBody(1)).toEqual({
      message: "Second",
      history: [
        { role: "user", content: "First" },
        { role: "assistant", content: "First reply" },
      ],
    });
  });

  it("passes a returned board to onBoardUpdate", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ reply: "Updated", board: initialData }), {
        headers: { ETag: '"9"' },
      }),
    );
    const onBoardUpdate = vi.fn();
    renderSidebar(onBoardUpdate);

    await send("Change the board");
    await screen.findByText("Updated");
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData, '"9"');
  });

  it("does not call onBoardUpdate for reply-only responses", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { reply: "Just text", board: null }),
    );
    const onBoardUpdate = vi.fn();
    renderSidebar(onBoardUpdate);

    await send("Question");
    await screen.findByText("Just text");
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });

  it("shows an error and restores the message when the request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { detail: "bad" }));
    renderSidebar();

    await send("Break things");
    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Break things");
    expect(screen.queryByTestId("chat-message-user")).not.toBeInTheDocument();
  });

  it("recovers from a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const onPendingChange = vi.fn();
    renderSidebar(vi.fn(), vi.fn(), onPendingChange);

    await send("Hello");
    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Hello");
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reports pending state around a request", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { reply: "Hi", board: null }),
    );
    const onPendingChange = vi.fn();
    renderSidebar(vi.fn(), vi.fn(), onPendingChange);

    await send("Hello");
    await screen.findByText("Hi");
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("ignores empty messages", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls onClose", async () => {
    const onClose = vi.fn();
    renderSidebar(vi.fn(), onClose);
    await userEvent.click(
      screen.getByRole("button", { name: /close ai assistant/i }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
