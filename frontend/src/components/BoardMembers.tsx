import { useState, type FormEvent } from "react";
import { hasStatus, isUnauthorized, request } from "@/lib/api";
import type { Member, Role } from "@/lib/kanban";

type BoardMembersProps = {
  boardId: number;
  role: Role;
  username: string;
  members: Member[];
  onMembersChange: (members: Member[]) => void;
  // The server unassigns a removed member's cards, which changes the board
  onMemberRemoved: () => void;
  onLeave: () => void;
  onSessionExpired: () => void;
};

const addErrorMessage = (error: unknown) => {
  if (hasStatus(error, 404)) {
    return "No user with that username";
  }
  if (hasStatus(error, 409)) {
    return "That user already has access";
  }
  return "Something went wrong. Please try again.";
};

const smallButton =
  "rounded-full px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

export const BoardMembers = ({
  boardId,
  role,
  username,
  members,
  onMembersChange,
  onMemberRemoved,
  onLeave,
  onSessionExpired,
}: BoardMembersProps) => {
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState("");

  const fail = (caught: unknown, message: string) => {
    if (isUnauthorized(caught)) {
      onSessionExpired();
    } else {
      setError(message);
    }
  };

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newMember.trim();
    if (!name) {
      return;
    }
    setError("");
    try {
      const added = await request<Member>(
        `/api/boards/${boardId}/members`,
        "POST",
        { username: name },
      );
      onMembersChange([...members, added]);
      setNewMember("");
    } catch (caught) {
      fail(caught, addErrorMessage(caught));
    }
  };

  const handleRemove = async (member: string) => {
    const leaving = member === username;
    if (leaving && !window.confirm("Leave this board? You will lose access to it.")) {
      return;
    }
    setError("");
    try {
      await request(
        `/api/boards/${boardId}/members/${encodeURIComponent(member)}`,
        "DELETE",
      );
      if (leaving) {
        onLeave();
        return;
      }
      onMembersChange(members.filter((item) => item.username !== member));
      onMemberRemoved();
    } catch (caught) {
      fail(caught, "Something went wrong. Please try again.");
    }
  };

  return (
    <section
      aria-label="Board members"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
        Members
      </h3>
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li
            key={member.username}
            data-testid="member"
            className="flex items-center justify-between gap-3 text-sm text-[var(--navy-dark)]"
          >
            <span>
              <span className="font-semibold">{member.username}</span>
              {member.username === username && (
                <span className="text-[var(--gray-text)]"> (you)</span>
              )}
              <span className="ml-2 text-xs uppercase tracking-wide text-[var(--gray-text)]">
                {member.role}
              </span>
            </span>
            {member.role === "member" &&
              (role === "owner" ? (
                <button
                  type="button"
                  onClick={() => handleRemove(member.username)}
                  className={smallButton}
                  aria-label={`Remove ${member.username}`}
                >
                  Remove
                </button>
              ) : (
                member.username === username && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.username)}
                    className={smallButton}
                  >
                    Leave board
                  </button>
                )
              ))}
          </li>
        ))}
      </ul>
      {role === "owner" && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={newMember}
            onChange={(event) => setNewMember(event.target.value)}
            placeholder="Username"
            aria-label="Share with username"
            className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Add member
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
    </section>
  );
};
