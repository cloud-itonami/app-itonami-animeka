/**
 * Minimal XRPC helper.
 *
 * Appview (`appview/.../svelte/src/xrpc.ts`) talks to the Worker
 * same-origin `/xrpc/*` endpoint. The Tauri WebView has no same-origin
 * Worker, so the base is absolute and configurable:
 *
 *   1. `VITE_ANIMEKA_XRPC_BASE` build-time env (Vite),
 *   2. `?base=` / `#base=` URL param,
 *   3. localStorage `animeka.xrpc.base` (settings row in the shell),
 *   4. default `https://animeka.etzhayyim.com/xrpc`.
 *
 * Only `com.etzhayyim.animeka.*` goes to this base. Blobs go directly to
 * the PDS (`https://atproto.etzhayyim.com/xrpc/com.atproto.sync.getBlob`,
 * needs `did` + `cid`); the animeka proxy would 404 on
 * `com.atproto.sync.getBlob`.
 *
 * Approval boundaries: this helper never calls a broker, murakumo or
 * vLLM loopback directly. Every domain call is an XRPC `POST .../{nsid}`
 * routed through the Worker shim (or `lg-clj` local server during dev),
 * so the Worker keeps the dougaka-broker-approval and
 * mangaka-reader/studio split, and murakumo stays behind the
 * `http`-loopback-only check in `lg-clj` (ADR-2605215000 — unreachable
 * from the phone, by design).
 *
 * PDS XRPC routes `com.etzhayyim.animeka.*` as POST-only regardless of
 * lexicon type, so `atQuery` and `atProcedure` both POST with a JSON
 * body. animeka stores domain fields in two places: typed columns on
 * `vertex_animeka` (snake_case) and a `props` JSON blob (original
 * camelCase payload). `flatProps` reads both.
 */

const DEFAULT_XRPC_BASE = 'https://animeka.etzhayyim.com/xrpc';
export const PDS_BASE = 'https://atproto.etzhayyim.com';

// Autopilot blobs are uploaded via legacy-trust header (no JWT session),
// so auth.userDid is undefined and PDS stores them under "anonymous".
export const BLOB_DID = 'anonymous';

export const XRPC_BASE_STORAGE_KEY = 'animeka.xrpc.base';

/** Normalise an operator-supplied base: trim, strip trailing "/", require http(s). */
export function normalizeXrpcBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return trimmed;
}

/** Read a persisted XRPC base override without throwing (sandboxed WebView). */
export function readStoredXrpcBase(): string | null {
  try {
    return normalizeXrpcBase(window.localStorage?.getItem(XRPC_BASE_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Persist an XRPC base override (`""` clears to the default). */
export function storeXrpcBase(raw: string): void {
  try {
    const normalized = raw.trim() ? normalizeXrpcBase(raw) : null;
    if (normalized) window.localStorage?.setItem(XRPC_BASE_STORAGE_KEY, normalized);
    else window.localStorage?.removeItem(XRPC_BASE_STORAGE_KEY);
  } catch {
    /* storage unavailable (opaque origin / private mode) — keep in-memory default */
  }
}

/** URL override from `?base=` or `#base=` (shareable) or `?xrpc=` `#xrpc=`. */
export function readUrlXrpcBase(): string | null {
  try {
    const search = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');
    return (
      normalizeXrpcBase(search.get('base') ?? search.get('xrpc')) ??
      normalizeXrpcBase(hashParams.get('base') ?? hashParams.get('xrpc'))
    );
  } catch {
    return null;
  }
}

function buildTimeBase(): string | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return normalizeXrpcBase(env?.VITE_ANIMEKA_XRPC_BASE ?? null);
  } catch {
    return null;
  }
}

/** Effective XRPC base for fetch calls. Pure except for the one-time lookup above. */
export function xrpcBase(): string {
  return readUrlXrpcBase() ?? buildTimeBase() ?? readStoredXrpcBase() ?? DEFAULT_XRPC_BASE;
}

export const DEFAULT_XRPC_BASE_URL = DEFAULT_XRPC_BASE;

/** Blob URL helper. com.atproto.sync.getBlob requires both did + cid. */
export function blobUrl(cid?: string | null, did: string = BLOB_DID): string {
  if (!cid) return '';
  const params = new URLSearchParams({ did, cid });
  return `${PDS_BASE}/xrpc/com.atproto.sync.getBlob?${params.toString()}`;
}

/** CSS background-image fragment with fallback to a flat block. */
export function blobBg(cid?: string | null, fallback = '#1d2430'): string {
  return cid ? `url(${blobUrl(cid)}) center/cover` : fallback;
}

/**
 * Animeka stores domain fields in two places: typed columns on
 * vertex_animeka (snake_case) and a `props` JSON blob (original camelCase
 * payload from addCut/etc.). The read view exposes both. Most camelCase
 * fields like `dialogueSummary` aren't in the typed-column allow-list, so
 * UI components must look in `props` as a fallback. This helper parses
 * `props` once and returns a getter that prefers typed snake_case if set,
 * falling back to the camelCase key inside props.
 */
export function flatProps(row: Record<string, unknown>): (snake: string, camel?: string) => unknown {
  let parsed: Record<string, unknown> | null = null;
  const propsRaw = row.props;
  if (typeof propsRaw === 'string' && propsRaw.length > 0) {
    try { parsed = JSON.parse(propsRaw) as Record<string, unknown>; } catch { parsed = null; }
  } else if (propsRaw && typeof propsRaw === 'object') {
    parsed = propsRaw as Record<string, unknown>;
  }
  return (snake, camel) => {
    const direct = row[snake];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    if (!parsed) return undefined;
    const c = camel ?? snake.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
    return parsed[c] ?? parsed[snake];
  };
}

export async function atQuery<T = unknown>(
  nsid: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  // POST + JSON body for both query and procedure call sites (see header).
  const resp = await fetch(`${xrpcBase()}/${nsid}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`XRPC ${nsid} failed: ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function atProcedure<T = unknown>(
  nsid: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const resp = await fetch(`${xrpcBase()}/${nsid}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`XRPC ${nsid} failed: ${resp.status}`);
  return resp.json() as Promise<T>;
}
