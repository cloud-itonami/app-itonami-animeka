import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareManifest } from "../scripts/android-manifest.mjs";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const conf = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));

test("itonami block is store metadata and matches tauri.conf", () => {
  assert.equal(pkg.itonami.id, "network.itonami.animeka");
  assert.equal(pkg.itonami.title, "Animeka — Team Anime Production");
  assert.equal(pkg.itonami.source, "app-itonami-animeka");
  assert.equal(conf.identifier, pkg.itonami.id);
  assert.equal(conf.version, pkg.version);
  assert.equal(conf.app.windows[0].title, "Animeka");
  assert.equal(conf.build.frontendDist, "../dist");
});

test("CSP allows only the animeka Worker + PDS, no wildcards", () => {
  const csp = conf.app.security.csp;
  assert.ok(csp.includes("https://animeka.etzhayyim.com"), "Worker host");
  assert.ok(csp.includes("https://atproto.etzhayyim.com"), "PDS host");
  assert.ok(csp.includes("ipc: http://ipc.localhost"), "Tauri IPC");
  assert.ok(!csp.includes("*"), "no wildcard origins");
  assert.ok(csp.includes("object-src 'none'"), "no plugin content");
});

test("package keeps tauri 3.0.0-alpha.6", () => {
  assert.equal(pkg.devDependencies["@tauri-apps/cli"], "3.0.0-alpha.6");
});

test("android manifest requires INTERNET and uiMode", () => {
  const good = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET" /><activity android:configChanges="orientation|uiMode" /></manifest>`;
  assert.equal(prepareManifest(good), good);
  assert.throws(
    () => prepareManifest(good.replace("android.permission.INTERNET", "android.permission.CAMERA")),
    /INTERNET/,
  );
  assert.throws(
    () => prepareManifest(good.replace("|uiMode", "").replace("|uiMode", "")),
    /uiMode/,
  );
});
