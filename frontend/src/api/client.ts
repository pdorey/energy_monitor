const API_BASE = "";

/**
 * Fetch JSON from API path. Uses same origin (API_BASE empty).
 *
 * @param path - API path (e.g. /api/overview).
 * @returns Parsed JSON response.
 * @throws Error if HTTP status not ok.
 */
export async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
