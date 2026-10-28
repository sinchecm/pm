import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

type Route = (init?: RequestInit) => Response;

const mockApi = (routes: Record<string, Route>) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    routes[url](init)
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
    mockApi({ "/api/me": () => jsonResponse(401, {}) });
    render(<Home />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId(/column-/)).toHaveLength(0);
  });

  it("shows the board when already signed in", async () => {
    mockApi({ "/api/me": () => jsonResponse(200, { username: "user" }) });
    render(<Home />);
    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = mockApi({
      "/api/me": () => jsonResponse(401, {}),
      "/api/login": () => jsonResponse(200, { username: "user" }),
    });
    render(<Home />);
    await signIn("user", "password");

    expect(await screen.findAllByTestId(/column-/)).toHaveLength(5);
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/login")!;
    expect(JSON.parse(init!.body as string)).toEqual({
      username: "user",
      password: "password",
    });
  });

  it("shows an error for invalid credentials", async () => {
    mockApi({
      "/api/me": () => jsonResponse(401, {}),
      "/api/login": () => jsonResponse(401, {}),
    });
    render(<Home />);
    await signIn("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password"
    );
    expect(screen.queryAllByTestId(/column-/)).toHaveLength(0);
  });

  it("logs out back to the login form", async () => {
    const fetchMock = mockApi({
      "/api/me": () => jsonResponse(200, { username: "user" }),
      "/api/logout": () => jsonResponse(200, { status: "ok" }),
    });
    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});
