export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed: ${status}`);
  }
}

// Sends JSON and resolves with the response; rejects with ApiError on a non-2xx status
export const send = async (
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> => {
  const response = await fetch(
    url,
    body === undefined
      ? { method, ...(Object.keys(headers).length ? { headers } : {}) }
      : {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return response;
};

// Like send, but resolves with the parsed JSON (undefined for 204)
export const request = async <T = void>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> => {
  const response = await send(url, method, body);
  return response.status === 204 ? (undefined as T) : response.json();
};

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

export const hasStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status;

// A board's data plus its ETag, which saves send back as If-Match
export const fetchBoard = async <T>(boardId: number) => {
  const response = await send(`/api/boards/${boardId}`);
  return {
    data: (await response.json()) as T,
    etag: response.headers.get("ETag"),
  };
};
