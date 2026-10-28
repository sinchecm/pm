import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/AuthForm";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillAndSubmit = async (username: string, password: string, button: RegExp) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: button }));
};

const switchToRegister = () =>
  userEvent.click(screen.getByRole("button", { name: /create an account/i }));

describe("AuthForm", () => {
  it("signs in and reports the user", async () => {
    const user = { id: 1, username: "user" };
    mockApi({ "POST /api/login": () => jsonResponse(200, user) });
    const onAuthenticated = vi.fn();
    render(<AuthForm onAuthenticated={onAuthenticated} />);

    await fillAndSubmit("user", "password", /^sign in$/i);
    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
  });

  it("shows a connection error when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<AuthForm onAuthenticated={vi.fn()} />);

    await fillAndSubmit("user", "password", /^sign in$/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });

  it("shows a notice until there is an error", async () => {
    mockApi({ "POST /api/login": () => jsonResponse(401, {}) });
    render(<AuthForm onAuthenticated={vi.fn()} notice="Your session expired." />);
    expect(screen.getByText("Your session expired.")).toBeInTheDocument();

    await fillAndSubmit("user", "nope", /^sign in$/i);
    await screen.findByRole("alert");
    expect(screen.queryByText("Your session expired.")).not.toBeInTheDocument();
  });

  it("creates an account", async () => {
    const user = { id: 5, username: "alice" };
    const fetchMock = mockApi({ "POST /api/register": () => jsonResponse(201, user) });
    const onAuthenticated = vi.fn();
    render(<AuthForm onAuthenticated={onAuthenticated} />);

    await switchToRegister();
    expect(screen.getByText(/create an account to start/i)).toBeInTheDocument();
    await fillAndSubmit("alice", "secret-pass", /^create account$/i);

    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
    expect(requestsTo(fetchMock, "POST", "/api/register")).toEqual([
      { username: "alice", password: "secret-pass" },
    ]);
  });

  it("explains a taken username", async () => {
    mockApi({ "POST /api/register": () => jsonResponse(409, {}) });
    render(<AuthForm onAuthenticated={vi.fn()} />);
    await switchToRegister();
    await fillAndSubmit("user", "password", /^create account$/i);
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is taken");
  });

  it("explains invalid registration details", async () => {
    mockApi({ "POST /api/register": () => jsonResponse(422, {}) });
    render(<AuthForm onAuthenticated={vi.fn()} />);
    await switchToRegister();
    await fillAndSubmit("a b", "short", /^create account$/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/);
  });

  it("switches back to sign in and clears the error", async () => {
    mockApi({ "POST /api/register": () => jsonResponse(409, {}) });
    render(<AuthForm onAuthenticated={vi.fn()} />);
    await switchToRegister();
    await fillAndSubmit("user", "password", /^create account$/i);
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to see your boards/i)).toBeInTheDocument();
  });
});
