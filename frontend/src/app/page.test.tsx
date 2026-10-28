import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { initialData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

type Route = (init?: RequestInit) => Response;

const mockApi = (routes: Record<string, Route>) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    routes[url](init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const signIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("shows the login form when not signed in", async () => {
    mockApi({ "/api/board": () => jsonResponse(401, {}) });
    render(<Home />);
    expect(
      await screen.findByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId(/column-/)).toHaveLength(0);
  });

  it("loads the board from the API when already signed in", async () => {
    mockApi({ "/api/board": () => jsonResponse(200, initialData) });
    render(<Home />);
    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
  });

  it("signs in with valid credentials", async () => {
    let signedIn = false;
    const fetchMock = mockApi({
      "/api/board": () =>
        signedIn ? jsonResponse(200, initialData) : jsonResponse(401, {}),
      "/api/login": () => {
        signedIn = true;
        return jsonResponse(200, { username: "user" });
      },
    });
    render(<Home />);
    await signIn("user", "password");

    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/login",
    )!;
    expect(JSON.parse(init!.body as string)).toEqual({
      username: "user",
      password: "password",
    });
  });

  it("shows an error for invalid credentials", async () => {
    mockApi({
      "/api/board": () => jsonResponse(401, {}),
      "/api/login": () => jsonResponse(401, {}),
    });
    render(<Home />);
    await signIn("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password",
    );
    expect(screen.queryAllByTestId(/column-/)).toHaveLength(0);
  });

  it("shows an error when the board fails to load", async () => {
    mockApi({ "/api/board": () => jsonResponse(500, {}) });
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load your board",
    );
    expect(
      screen.queryByRole("button", { name: /sign in/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an error when the server can't be reached during login", async () => {
    const routes: Record<string, Route> = {
      "/api/board": () => jsonResponse(401, {}),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/login") {
          throw new TypeError("Failed to fetch");
        }
        return routes[url]();
      }),
    );
    render(<Home />);
    await signIn("user", "password");

    expect(
      await screen.findByText(/could not reach the server/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("returns to login with a notice when the session expires", async () => {
    mockApi({
      "/api/board": (init) =>
        init?.method === "PUT"
          ? jsonResponse(401, {})
          : jsonResponse(200, initialData),
    });
    render(<Home />);
    const input = (await screen.findAllByLabelText("Column title"))[0];
    await userEvent.type(input, "!");

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("logs out back to the login form", async () => {
    const fetchMock = mockApi({
      "/api/board": () => jsonResponse(200, initialData),
      "/api/logout": () => jsonResponse(200, { status: "ok" }),
    });
    render(<Home />);
    await userEvent.click(
      await screen.findByRole("button", { name: /log out/i }),
    );

    expect(
      await screen.findByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});
