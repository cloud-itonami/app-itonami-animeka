// Prepare the AndroidManifest.xml that `tauri android init` generates, for the
// APK that scripts/android-apk.sh builds:
// - the main activity must list uiMode in android:configChanges, so a theme
//   switch reaches MainActivity.onConfigurationChanged instead of recreating it.
//
// Unlike the offline classification-series apps (which remove
// android.permission.INTERNET), animeka KEEPS it: the WebView fetches the
// Worker XRPC base (default https://animeka.etzhayyim.com/xrpc) and blob
// images from the AT PDS. This script never removes INTERNET and fails
// closed if the manifest asks for nothing.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The manifest text verified in place, or an Error describing why it cannot be prepared. */
export function prepareManifest(xml) {
  const changes = [...xml.matchAll(/android:configChanges="([^"]*)"/g)].map((m) => m[1].split("|"));
  if (changes.length === 0 || !changes.every((list) => list.includes("uiMode"))) {
    throw new Error("AndroidManifest.xml configChanges has no uiMode; MainActivity.onConfigurationChanged would not see a theme switch");
  }
  if (!xml.includes("android.permission.INTERNET")) {
    throw new Error("AndroidManifest.xml does not ask for android.permission.INTERNET; animeka needs it for the Worker/PDS fetch");
  }
  return xml;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/android-manifest.mjs <AndroidManifest.xml>");
    process.exit(1);
  }
  try {
    await writeFile(file, prepareManifest(await readFile(file, "utf8")));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
