import { useState, type FormEvent } from "react";
import { ApiError, request } from "@/lib/api";
import type { User } from "@/lib/kanban";

type AuthFormProps = {
  onAuthenticated: (user: User) => void;
  notice?: string;
};

type Mode = "signin" | "register";

const errorMessage = (mode: Mode, error: unknown) => {
  if (!(error instanceof ApiError)) {
    return "Could not reach the server. Please try again.";
  }
  if (mode === "signin") {
    return "Invalid username or password";
  }
  if (error.status === 409) {
    return "That username is taken";
  }
  return "Use 3-32 letters, numbers, dots, dashes or underscores for the username, and at least 8 characters for the password.";
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

export const AuthForm = ({ onAuthenticated, notice }: AuthFormProps) => {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const user = await request<User>(
        isRegister ? "/api/register" : "/api/login",
        "POST",
        { username, password },
      );
      onAuthenticated(user);
    } catch (caught) {
      setError(errorMessage(mode, caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? "signin" : "register");
    setError("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] lg:w-96"
    >
      <div>
        <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
        <h2 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          {isRegister
            ? "Create an account to start planning."
            : "Sign in to see your boards."}
        </p>
      </div>
      <label className={labelClass}>
        Username
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className={inputClass}
          required
        />
      </label>
      <label className={labelClass}>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          className={inputClass}
          required
        />
      </label>
      {notice && !error && (
        <p className="text-sm font-medium text-[var(--primary-blue)]">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm font-medium text-[var(--secondary-purple)]"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {isRegister ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-[var(--gray-text)]">
        {isRegister ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-semibold text-[var(--primary-blue)] hover:underline"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
};
