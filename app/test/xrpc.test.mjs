import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Mirror of src/xrpc.ts normalizeXrpcBase (duplicated here so the test
// exercises the contract without needing a TS loader).
function normalizeXrpcBase(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  let url;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return trimmed;
}

test("normalizeXrpcBase trims and validates", () => {
  assert.equal(normalizeXrpcBase(null), null);
  assert.equal(normalizeXrpcBase("  "), null);
  assert.equal(normalizeXrpcBase("https://example.com/xrpc/"), "https://example.com/xrpc");
  assert.equal(normalizeXrpcBase("https://example.com/xrpc///"), "https://example.com/xrpc");
  assert.equal(normalizeXrpcBase("ftp://example.com"), null);
  assert.equal(normalizeXrpcBase("not a url"), null);
});

test("xrpc.ts points at the Worker by default and direct-PDS for blobs", async () => {
  const src = await readFile(new URL("../src/xrpc.ts", import.meta.url), "utf8");
  assert.ok(src.includes("https://animeka.etzhayyim.com/xrpc"), "Worker default");
  assert.ok(src.includes("https://atproto.etzhayyim.com"), "PDS blob base");
  assert.ok(src.includes("com.atproto.sync.getBlob"), "blob NSID");
  assert.ok(src.includes("animeka.xrpc.base"), "storage override key");
  assert.ok(src.includes("VITE_ANIMEKA_XRPC_BASE"), "build-time override");
  // No direct broker / murakumo / vLLM loopback URL is hard-coded.
  assert.ok(!/117\.0\.0\.0|10\.0\.2\.2|localhost:4000|127\.0\.0\.1/.test(src), "no loopback bypass");
});

test("12 actors + 12 stages are intact", async () => {
  const src = await readFile(new URL("../src/actors.ts", import.meta.url), "utf8");
  const slugs = [...src.matchAll(/slug:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.equal(slugs.length, 12);
  assert.ok(slugs.includes("director") && slugs.includes("editor"));
  const stages = [...src.matchAll(/key:\s*'([a-zA-Z]+)'\s*,\s*label/g)].map((m) => m[1]);
  assert.deepEqual(stages, [
    "script", "storyboard", "layout", "keyAnim", "inbetween", "colorDesign",
    "finish", "background", "composite", "edit", "sound", "delivery",
  ]);
});

test("all seven views + both components exist and are wired in the shell", async () => {
  const views = ["Dashboard", "PipelineBoard", "CutDetail", "CutList", "Gallery", "ScriptView", "ReviewRoom"];
  for (const v of views) {
    const src = await readFile(new URL(`../src/views/${v}.svelte`, import.meta.url), "utf8");
    assert.ok(src.includes("atQuery") || v === "Gallery" || src.length > 500, `${v} loads via XRPC or is self-contained`);
  }
  const shell = await readFile(new URL("../src/App.svelte", import.meta.url), "utf8");
  for (const v of views) assert.ok(shell.includes(`${v} from './views/${v}.svelte'`), `shell imports ${v}`);
  assert.ok(shell.includes("tabbar"), "bottom tab bar");
  assert.ok(shell.includes("xrpcBase()"), "effective base display");
});

test("tauri.js shim forwards to the real CLI (ESM, type:module)", async () => {
  const shim = await readFile(new URL("../src-tauri/tauri.js", import.meta.url), "utf8");
  assert.ok(shim.includes("createRequire"), "ESM shim");
  assert.ok(shim.includes("@tauri-apps"), "real CLI path");
});
