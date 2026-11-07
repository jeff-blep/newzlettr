import { Agent, fetch as ufetch, type RequestInit as URequestInit } from "undici";

/** One shared lenient agent - used ONLY for connections where the user ticked "ignore TLS errors". */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export interface HttpOptions {
  timeoutMs?: number;
  ignoreTlsErrors?: boolean;
  headers?: Record<string, string>;
  method?: string;
  body?: URequestInit["body"];
}

export async function httpFetch(url: string, opts: HttpOptions = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 10_000);
  try {
    return await ufetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: ac.signal,
      redirect: "follow",
      dispatcher: opts.ignoreTlsErrors ? insecureAgent : undefined,
    });
  } catch (e) {
    throw new HttpError(describeNetworkError(e, url, opts.timeoutMs ?? 10_000));
  } finally {
    clearTimeout(timer);
  }
}

export async function httpJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await httpFetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  const text = await res.text();
  if (!res.ok) throw new HttpError(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`, res.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`Expected JSON but got: ${text.slice(0, 120)}`);
  }
}

/** Human-readable reason for a failed request (the raw undici errors are cryptic). */
export function describeNetworkError(e: unknown, url: string, timeoutMs: number): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } };
  const code = err.cause?.code ?? err.cause?.errors?.find((x) => x.code)?.code ?? "";
  const host = safeHost(url);
  if (err.name === "AbortError") return `Timed out after ${Math.round(timeoutMs / 1000)}s connecting to ${host}`;
  if (code === "ECONNREFUSED") return `Connection refused by ${host} — is the service running and the port right?`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `Can't resolve host ${host}`;
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return `${host} is unreachable from this machine`;
  if (code.startsWith("ERR_TLS") || code.includes("CERT") || code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
    return `TLS certificate problem with ${host} (${code}). Use the right hostname, or enable "Ignore TLS errors".`;
  }
  if (err.cause?.message === "bad port") return `Port ${new URL(url).port} is blocked for HTTP by the fetch standard — use the service's real port`;
  const detail = err.cause?.message ?? err.message ?? "Request failed";
  return `Couldn't connect to ${host}: ${detail}${code && !detail.includes(code) ? ` (${code})` : ""}`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Normalizes a user-entered base URL: trims, adds http:// if missing, strips trailing slash. */
export function normalizeBaseUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, "");
}
