/**
 * api.ts — thin typed wrapper around fetch for all backend calls.
 * Uses the running backend at localhost:3000/api/v1.
 * All requests include Authorization: Bearer <token> from localStorage.
 */

const BASE_URL = 'http://localhost:3000/api/v1';

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
