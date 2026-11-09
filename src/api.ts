import type {
  ReferenceMeta,
  SceneResponse,
  Weather,
} from "../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  return body as T;
}

export function fetchWeather(refresh = false): Promise<Weather> {
  return request<Weather>(`/api/weather${refresh ? "?refresh=1" : ""}`, {
    signal: AbortSignal.timeout(30_000),
  });
}

export function fetchScene(): Promise<SceneResponse> {
  return request<SceneResponse>("/api/scene", {
    signal: AbortSignal.timeout(30_000),
  });
}

export function generateScene(force = false): Promise<SceneResponse> {
  return request<SceneResponse>(`/api/scene${force ? "?refresh=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
    // Image generation takes ~20 seconds; leave a generous margin.
    signal: AbortSignal.timeout(200_000),
  });
}

export function fetchReferenceMeta(): Promise<ReferenceMeta> {
  return request<ReferenceMeta>("/api/reference/meta", {
    signal: AbortSignal.timeout(15_000),
  });
}
