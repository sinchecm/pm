import { useState, type FormEvent } from "react";
import { ApiError, isUnauthorized, request } from "@/lib/api";

type AccountSettingsProps = {
  onClose: () => void;
  onAccountDeleted: () => void;
  onSessionExpired: () => void;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";
const sectionClass =
  "space-y-4 rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]";

const failureMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 403) {
    return "Password is incorrect";
  }
  if (error instanceof ApiError && error.status === 422) {
    return "The new password must be at least 8 characters";
  }
  return "Something went wrong. Please try again.";
};

export const AccountSettings = ({
  onClose,
  onAccountDeleted,
  onSessionExpired,
}: AccountSettingsProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    try {
      await request("/api/me/password", "PUT", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated.");
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }
      setPasswordError(failureMessage(error));
    }
  };

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleteError("");
    if (
      !window.confirm(
        "Delete your account and all your boards? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await request("/api/me", "DELETE", { password: deletePassword });
      onAccountDeleted();
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }
      setDeleteError(failureMessage(error));
    }
  };

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Account
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
        >
          Back to board
        </button>
      </div>

      <form onSubmit={handleChangePassword} className={sectionClass}>
        <h3 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
          Change password
        </h3>
        <label className={labelClass}>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            className={inputClass}
            required
          />
        </label>
        <label className={labelClass}>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            required
          />
        </label>
        {passwordMessage && (
          <p
            role="status"
            className="text-sm font-medium text-[var(--primary-blue)]"
          >
            {passwordMessage}
          </p>
        )}
        {passwordError && (
          <p
            role="alert"
            className="text-sm font-medium text-[var(--secondary-purple)]"
          >
            {passwordError}
          </p>
        )}
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Update password
        </button>
      </form>

      <form onSubmit={handleDeleteAccount} className={sectionClass}>
        <h3 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
          Delete account
        </h3>
        <p className="text-sm text-[var(--gray-text)]">
          Permanently removes your account and every board in it.
        </p>
        <label className={labelClass}>
          Confirm with your password
          <input
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            autoComplete="current-password"
            className={inputClass}
            required
          />
        </label>
        {deleteError && (
          <p
            role="alert"
            className="text-sm font-medium text-[var(--secondary-purple)]"
          >
            {deleteError}
          </p>
        )}
        <button
          type="submit"
          className="rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white"
        >
          Delete account
        </button>
      </form>
    </section>
  );
};
