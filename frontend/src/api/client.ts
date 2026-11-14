import type { ValidationIssue } from './types';

/** API base URL without trailing slash. Configure with VITE_API_URL. */
export const API_BASE: string = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
).replace(/\/+$/, '');

/** Generic HTTP failure (non-2xx, network error, invalid JSON). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** HTTP 422 from /api/predict or /api/explain/lime, with one issue per bad feature. */
export class ValidationError extends ApiError {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], body: unknown) {
    super(
      issues.length === 1
        ? `${issues[0].feature}: ${issues[0].msg}`
        : `${issues.length} input problems need fixing`,
      422,
      body,
    );
    this.name = 'ValidationError';
    this.issues = issues;
  }

  /** Map feature name -> message, convenient for highlighting form fields. */
  byFeature(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.feature, i.msg]));
  }
}

export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}

/** Prefix an API-relative path ("/static/figures/x.png") with the API base. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * URL of a figure served by the backend. Accepts the `url` from the figure list
 * ("/static/figures/09_shap_bar.png") or a bare file name ("09_shap_bar.png").
 */
export function figureUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return apiUrl(path);
  return apiUrl(`/static/figures/${path}`);
}

/** Normalise FastAPI 422 details: the contract shape and FastAPI's default shape. */
function parseValidationIssues(body: unknown): ValidationIssue[] | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (!Array.isArray(detail)) {
    return typeof detail === 'string' ? [{ feature: '', msg: detail }] : null;
  }
  return detail.map((item): ValidationIssue => {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      if (typeof rec.feature === 'string' && typeof rec.msg === 'string') {
        return { feature: rec.feature, msg: rec.msg };
      }
      // FastAPI/pydantic default: { loc: [...], msg, type }
      const loc = Array.isArray(rec.loc) ? rec.loc.map(String) : [];
      return {
        feature: loc.length > 0 ? loc[loc.length - 1] : '',
        msg: typeof rec.msg === 'string' ? rec.msg : JSON.stringify(item),
      };
    }
    return { feature: '', msg: String(item) };
  });
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

/**
 * Fetch JSON from the API. `path` is relative to the API base ("/api/metadata").
 * Throws ValidationError on 422, ApiError for any other failure.
 */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      `Cannot reach the API at ${API_BASE}. Is the backend running?`,
      0,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    if (response.status === 422) {
      const issues = parseValidationIssues(body);
      if (issues) throw new ValidationError(issues, body);
    }
    throw new ApiError(
      messageFromBody(body, `Request failed (${response.status} ${response.statusText})`),
      response.status,
      body,
    );
  }

  return body as T;
}

/** POST a JSON body and parse the JSON response. */
export function postJson<T>(path: string, data: unknown, init?: RequestInit): Promise<T> {
  return fetchJson<T>(path, { ...init, method: 'POST', body: JSON.stringify(data) });
}
