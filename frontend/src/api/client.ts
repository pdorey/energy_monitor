const API_BASE = "";

/**
 * Fetch JSON from API path. Uses same origin (API_BASE empty).
 *
 * @param path - API path (e.g. /api/overview).
 * @param params - Optional query params (e.g. { day_of_week: "saturday" }).
 * @returns Parsed JSON response.
 * @throws Error if HTTP status not ok.
 */
export async function fetchJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, v);
    });
  }
  const res = await fetch(`${API_BASE}${url.pathname}${url.search}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
