// Stubs fetch with a route table keyed by "METHOD /url"; unknown routes fail the test
type Route = (body: unknown) => Response | Promise<Response>;

export const jsonResponse = (status: number, body?: unknown) =>
  body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status });

export const mockApi = (routes: Record<string, Route>) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return route(init?.body ? JSON.parse(init.body as string) : undefined);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

export const requestsTo = (
  fetchMock: ReturnType<typeof mockApi>,
  method: string,
  url: string,
) =>
  fetchMock.mock.calls
    .filter(([calledUrl, init]) => calledUrl === url && (init?.method ?? "GET") === method)
    .map(([, init]) => (init?.body ? JSON.parse(init.body as string) : undefined));
