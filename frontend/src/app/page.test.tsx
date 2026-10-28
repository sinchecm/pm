import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { initialData } from "@/lib/kanban";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

const user = { id: 1, username: "user" };
const boards = [
  { id: 1, name: "My Board", createdAt: "2026-10-01", updatedAt: "2026-10-01" },
];

// Routes for a signed-in user with one board
const workspaceRoutes = {
  "GET /api/boards": () => jsonResponse(200, boards),
  "GET /api/boards/1": () => jsonResponse(200, initialData),
  "GET /api/boards/1/members": () =>
    jsonResponse(200, [{ username: "user", role: "owner" }]),
  "GET /api/boards/1/comment-counts": () => jsonResponse(200, {}),
};

const signIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("Home", () => {
  it("shows the sign in form when not signed in", async () => {
    mockApi({ "GET /api/me": () => jsonResponse(401, {}) });
    render(<Home />);
    expect(
      await screen.findByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^column-/)).toHaveLength(0);
  });

  it("opens the workspace when already signed in", async () => {
    mockApi({
      "GET /api/me": () => jsonResponse(200, user),
      ...workspaceRoutes,
    });
    render(<Home />);
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(screen.getByTestId("current-user")).toHaveTextContent("user");
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = mockApi({
      "GET /api/me": () => jsonResponse(401, {}),
      "POST /api/login": () => jsonResponse(200, user),
      ...workspaceRoutes,
    });
    render(<Home />);
    await signIn("user", "password");

    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
    expect(requestsTo(fetchMock, "POST", "/api/login")).toEqual([
      { username: "user", password: "password" },
    ]);
  });

  it("shows an error for invalid credentials", async () => {
    mockApi({
      "GET /api/me": () => jsonResponse(401, {}),
      "POST /api/login": () => jsonResponse(401, {}),
    });
    render(<Home />);
    await signIn("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password",
    );
    expect(screen.queryAllByTestId(/^column-/)).toHaveLength(0);
  });

  it("shows an error when the server fails", async () => {
    mockApi({ "GET /api/me": () => jsonResponse(500, {}) });
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server",
    );
    expect(
      screen.queryByRole("button", { name: /sign in/i }),
    ).not.toBeInTheDocument();
  });

  it("returns to sign in with a notice when the session expires", async () => {
    mockApi({
      "GET /api/me": () => jsonResponse(200, user),
      ...workspaceRoutes,
      "PUT /api/boards/1": () => jsonResponse(401, {}),
    });
    render(<Home />);
    const input = (await screen.findAllByLabelText("Column title"))[0];
    await userEvent.type(input, "!");

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("logs out back to the sign in form", async () => {
    const fetchMock = mockApi({
      "GET /api/me": () => jsonResponse(200, user),
      ...workspaceRoutes,
      "POST /api/logout": () => jsonResponse(200, { status: "ok" }),
    });
    render(<Home />);
    await userEvent.click(
      await screen.findByRole("button", { name: /log out/i }),
    );

    expect(
      await screen.findByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, "POST", "/api/logout")).toHaveLength(1);
  });

  it("returns to sign in with a notice after deleting the account", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi({
      "GET /api/me": () => jsonResponse(200, user),
      ...workspaceRoutes,
      "DELETE /api/me": () => jsonResponse(204),
    });
    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
    await userEvent.type(screen.getByLabelText(/confirm with your password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("Your account was deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
