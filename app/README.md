# Animeka — Android (Tauri v3) production-progress app

Team-based anime production actor — the Android face of `app-itonami-animeka`.
A read-mostly board over the 12-stage pipeline (原作 → 脚本 → 絵コンテ →
レイアウト → 原画 → 動画 → 色指定 → 仕上げ → 背景 → 撮影 → 編集 → 音響) with the
*cut* (shot) as the atom. This is **not** a blueprint viewer and **not** the
offline `restricted-wasm-v1` series template (those ship
`connect-src ipc:` only and drop `INTERNET` — this app keeps both, see below).

Machine identity is `../blueprint.edn` + `../README.edn`; `../AGENTS.md` is the
target design, and `../README.md`'s “What actually runs” (`lg-clj/`,
27 graphs — the working tree) is the source of truth for what the app talks
to. `appview/` is the Worker+SvelteKit facade this app reuses its UI from.

## What the app shows (screen inventory, 390×844)

Bottom-tab shell (`src/App.svelte`), `max-width: 560px` so desktop shows the
same phone layout. Views are copied verbatim from `appview/.../svelte/src/views`
and made responsive with `@media (max-width: 640px)` only — no logic fork.

|#|画面 (tab)|状態|主要操作|
|---|---|---|---|
|1|作品 (Works / Dashboard)|実装済み — `listWorks` + `listEpisodes` + `listCuts` + open-retake count で話 × 12工程ヒートマップ (Episode Gantt) と stats 集計|作品切替 / 新規作品タイトル送信 (`createWork`) / 統計再集計。出版・スコア等の書き込みボタンは Worker 経由のまま保持 (Stage 1 は読面が主)|
|2|工程 (Pipeline / PipelineBoard)|実装済み — `listCuts` + `listRetakes(open)` で 12列 × cut 行ボード、retake フィルタ、actor スロットル|行タップで Cut 詳細へ / retake のみ表示 / actor の stage ハイライト / Chat (`com.etzhayyim.animeka.chat` 経由)。ボードは横スクロール (760px min)|
|3|カット (Cuts / CutList)|実装済み — `listCuts(limit 200)` のカード一覧、進捗バー、retake バッジ|カードタップで Cut 詳細へ (`/at/.../cut/{rkey}`)|
|4|Cut 詳細 (CutDetail)|実装済み — 3タブ (Storyboard / Animation / Color&Comp)、`listCuts` + `listRetakes(cut_id)`|pipeline strip の stage 状態確認、retake 投稿・解決 (`submitRetake` / `resolveRetake` の XRPC 経路のみ)|
|5|画廊 (Gallery)|実装済み — `listCuts` で画像 CID 持ちカットを時系列表示、ライトボックス|カードで 4コマコマ送りライトボックス表示|
|6|脚本 (Script / ScriptView)|実装済み — `listCuts` を scene 単位に縦スクロール、dialogue + thumb|行タップで scene 詳細 (現状表示のみ)|
|7|試写 (Review / ReviewRoom)|実装済み — `listCuts` + `listRetakes` で playlist + frame-accurate scrub + retake マーカー|再生/シーク、retake タイムラインマーカー確認、retake 投稿・解決|
|8|⚙️ 接続設定 (shell topbar)|実装済み (App.svelte)|XRPC ベースの確認・上書き (`?base=` / localStorage `animeka.xrpc.base` / `VITE_ANIMEKA_XRPC_BASE`)。既定は Worker|

All list screens show the shared empty state ("No cuts yet… create a work,
add an episode…") when the fetch fails or returns nothing — the UI never
fabricates cuts, works or counts.

Approval boundaries are unchanged: every domain call is an XRPC
`POST .../{nsid}` through the Worker shim (or `lg-clj` locally), so the
dougaka-broker-approval and mangaka-reader/studio splits stay on the Worker.
The app never calls a broker, murakumo or a vLLM loopback directly
(`lg_animeka.llm/assert-murakumo` is `http` + six loopback host:port pairs
only, ADR-2605215000 — unreachable from the phone, by design). `flatProps`
merges the `vertex_animeka` typed columns (snake_case) with the `props` JSON
blob (camelCase) exactly like appview.

## Network

- XRPC base: default `https://animeka.etzhayyim.com/xrpc`, override order
  `?base=`/`#base=` → `VITE_ANIMEKA_XRPC_BASE` → localStorage. Normalized
  by `src/xrpc.ts` (`normalizeXrpcBase`, http(s) only).
- Blobs: direct to `https://atproto.etzhayyim.com/xrpc/com.atproto.sync.getBlob`
  (`did=anonymous` for legacy-trust autopilot blobs).
- CSP (`src-tauri/tauri.conf.json`): `connect-src` lists only the animeka
  Worker, the alias host, the PDS and Tauri IPC — no `*`.
- `INTERNET` is **required and kept** (`scripts/android-apk.sh` fails if the
  merged manifest lacks it; `scripts/android-manifest.mjs` checks `uiMode`
  + `INTERNET` instead of removing anything). Do not copy the offline
  series `android-manifest.mjs` removal into this app.
- Local `lg-clj` (`http://127.0.0.1:2027`) works on desktop dev; from the
  phone the loopback is not reachable and the cleartext policy may block
  `http://` overrides — use the Worker default for device checks.

## Build and test

```sh
export PATH="$HOME/.cargo/bin:$PATH"                                  # /opt/homebrew rustc lacks the android target
export JAVA_HOME=/opt/homebrew/opt/openjdk@21                         # /usr/libexec/java_home is empty here
export ANDROID_HOME=$HOME/Library/Android/sdk NDK_HOME=$HOME/Library/Android/sdk/ndk/27.0.12077973
cd app
npm ci
npm run build            # vite build → dist/ (Tauri frontendDist)
npm test                 # build + node --test test/*.test.mjs
npm run build:android    # scripts/android-apk.sh
```

`scripts/android-apk.sh` does a **fresh** `tauri android init --ci` every
run (`src-tauri/gen/android` is generated — never edited, never committed;
delete it and re-init if corrupt), injects the committed
`android/MainActivity.kt` by `tauri.conf.json` package id, then
`node_modules/.bin/tauri android build --debug --apk --target aarch64 --ci`.
`src-tauri/tauri.js` is the ESM shim that lets Gradle's `BuildTask.kt`
(`node tauri android android-studio-script` from `src-tauri/`) resolve the
CLI. Debug APK only — no store signing, no production deploy, no merge.

Before any build, obey the fleet disk gate: `cat
/Users/node/.orca/bots/organizer/memory/disk/signal.tsv` must read `GO`, plus
`df -h /System/Volumes/Data` 3× with minimum ≥ 4 GiB; abort mid-run if the
minimum drops below 2 GiB (`cargo clean`, report). Rust target
`aarch64-linux-android` must be installed
(`~/.cargo/bin/rustup target list --installed`). Log the build to a file and
judge by exit code + the `Finished … APK` line.

After a green build, capture `aapt2 dump permissions` + `dump badging`
(`$ANDROID_HOME/build-tools/*\/aapt2`, gerund forms) **before** deleting
anything, then shelve the APK to a fresh immutable
`apk-vm-<date>-<shortsha>/` (never rewrite an existing one), one-line
`apk-sha256.txt` (sha256 + filename + bytes) and a history tail in the
`apk-vm/README.md`.

## Limits

- Read-mostly board. Write buttons inherited from appview (`createWork`,
  chat, retake submit/resolve, publish/score/kaizen/audio on the Works
  screen) all go through the XRPC Worker shim — no new write path and no
  approval bypass is introduced here. Heavyweight publish/score/kaizen
  surfaces stay on the Works screen for parity; reviewers may elect to
  hide them on small screens later.
- The KAMI-engine X-sheet canvas / onion-skin WASM (`appview/.../static/`)
  and the timeline video binaries are **not** bundled; CutDetail shows the
  blob-backed still / video slots only.
- Icons under `src-tauri/icons/` are inherited from the series template as
  placeholders; replace with animeka artwork before any store submission.
