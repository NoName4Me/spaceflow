export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public conflicts: string[] = [],
  ) {
    super(message);
  }
}
export async function api<T = void>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.message || "请求失败",
      response.status,
      body.conflicts || [],
    );
  return body as T;
}
export const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败";
