# apk-vm — build evidence (immutable)

One directory per build: `apk-vm/YYYYMMDD-<shortsha>/`. Existing directories
are never rewritten; a rebuild gets a fresh one. Each directory holds the
debug APK (`app-universal-debug.apk`), one-line `apk-sha256.txt`
(`sha256  bytes  filename`), `aapt2 dump permissions/badging` (36.0.0 +
36.1.0), `apksigner.txt` and the full build log. APK binaries are
gitignored (large); digests below are the reviewable evidence.

## History

| Date | Head SHA | APK sha256 | Bytes | Dir | Permissions |
|---|---|---|---|---|---|
| 2026-11-23 | (see branch) | `479a4c001ecf654755b13628b7bba56e538410e2eff9666d878bdd5026a889e0` | 19636563 | `20261123-479a4c00` | `INTERNET` + `network.itonami.animeka.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` |

Build: `cd app && sh scripts/android-apk.sh` (env: cargo-first PATH, JDK 21,
NDK 27.0.12077973, `aarch64-linux-android`).
