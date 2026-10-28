import { useEffect, useState, type FormEvent } from "react";
import { isUnauthorized, request } from "@/lib/api";
import { formatTimestamp, type Comment } from "@/lib/kanban";

export type CommentsContext = {
  boardId: number;
  username: string;
  isOwner: boolean;
  onCountChange: (cardId: string, count: number) => void;
  onSessionExpired: () => void;
};

type CardCommentsProps = CommentsContext & { cardId: string };

export const CardComments = ({
  boardId,
  cardId,
  username,
  isOwner,
  onCountChange,
  onSessionExpired,
}: CardCommentsProps) => {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const url = `/api/boards/${boardId}/cards/${encodeURIComponent(cardId)}/comments`;

  const fail = (caught: unknown, message: string) => {
    if (isUnauthorized(caught)) {
      onSessionExpired();
    } else {
      setError(message);
    }
  };

  useEffect(() => {
    request<Comment[]>(url).then(setComments, (caught) => {
      if (isUnauthorized(caught)) {
        onSessionExpired();
      } else {
        setError("Could not load the comments.");
      }
    });
  }, [url, onSessionExpired]);

  const update = (next: Comment[]) => {
    setComments(next);
    onCountChange(cardId, next.length);
  };

  const handlePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    setError("");
    try {
      const added = await request<Comment>(url, "POST", { text });
      update([...(comments ?? []), added]);
      setText("");
    } catch (caught) {
      fail(caught, "Could not post the comment.");
    }
  };

  const handleDelete = async (commentId: number) => {
    setError("");
    try {
      await request(`/api/boards/${boardId}/comments/${commentId}`, "DELETE");
      update((comments ?? []).filter((comment) => comment.id !== commentId));
    } catch (caught) {
      fail(caught, "Could not delete the comment.");
    }
  };

  return (
    <section aria-label="Comments" className="mt-3 space-y-3 border-t border-[var(--stroke)] pt-3">
      {comments?.length === 0 && (
        <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
      )}
      <ul className="space-y-2">
        {comments?.map((comment) => (
          <li key={comment.id} data-testid="comment" className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--navy-dark)]">
                {comment.author}
                <span className="ml-2 font-normal text-[var(--gray-text)]">
                  {formatTimestamp(comment.createdAt)}
                </span>
              </span>
              {(comment.author === username || isOwner) && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                  aria-label={`Delete comment by ${comment.author}`}
                >
                  Delete
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[var(--navy-dark)]">{comment.text}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={handlePost} className="space-y-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a comment"
          aria-label="New comment"
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Post
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
    </section>
  );
};
