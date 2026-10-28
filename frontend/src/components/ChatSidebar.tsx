import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardData } from "@/lib/kanban";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  boardId: number;
  isOpen: boolean;
  onClose: () => void;
  onBoardUpdate: (board: BoardData, etag: string | null) => void;
  onPendingChange: (isPending: boolean) => void;
};

// Stays mounted while closed so the conversation is kept
export const ChatSidebar = ({
  boardId,
  isOpen,
  onClose,
  onBoardUpdate,
  onPendingChange,
}: ChatSidebarProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) {
      return;
    }
    setInput("");
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsSending(true);
    onPendingChange(true);

    try {
      const response = await fetch(`/api/boards/${boardId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: messages }),
      });
      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }
      const data: { reply: string; board: BoardData | null } =
        await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
      if (data.board) {
        onBoardUpdate(data.board, response.headers.get("ETag"));
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1));
      setInput(message);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
      onPendingChange(false);
    }
  };

  return (
    <aside
      hidden={!isOpen}
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] sm:w-[380px]"
      aria-label="AI assistant"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--stroke)] p-6">
        <div>
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h2 className="mt-3 font-display text-xl font-semibold text-[var(--navy-dark)]">
            AI Assistant
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-text)]">
            Ask about this board, or ask me to add, edit or move cards and columns.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          aria-label="Close AI assistant"
        >
          Close
        </button>
      </div>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-6"
      >
        {messages.length === 0 && (
          <p className="text-sm text-[var(--gray-text)]">
            Try: &ldquo;Add a card to Backlog for planning the launch&rdquo;
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            data-testid={`chat-message-${message.role}`}
            className={clsx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
              message.role === "user"
                ? "self-end bg-[var(--primary-blue)] text-white"
                : "self-start bg-[var(--surface)] text-[var(--navy-dark)]",
            )}
          >
            {message.content}
          </div>
        ))}
        {isSending && (
          <div className="self-start rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]">
            Thinking...
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--stroke)] p-6"
      >
        {error && (
          <p className="mb-3 text-sm font-medium text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message the assistant"
            aria-label="Message"
            className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={isSending}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
};
