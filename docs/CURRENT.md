# Current engineering state

Snapshot: 2026-10-20. Read this after [AGENTS.md](../AGENTS.md), then use [CONTRIBUTING.md](../CONTRIBUTING.md) to develop.

## Baseline and stopping point

- Version: **0.1.10** in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
- Latest release recorded in [CHANGELOG.md](../CHANGELOG.md): **v0.1.10**, 2026-09-08, at `87c9c31`.
- Main baseline before the macOS changes: **`61f740c`**, including the public engineering handoff, Windows validation notes, and local archive ignore rule. The macOS changes recorded below remain unreleased.
- Two changes after v0.1.10 are merged but unreleased: Windows Rust CI (`c4ddff3`, #22) and rejecting dragged `.txt` files (`092ca7a`, #23). No version bump follows them yet.
- The current stopping point is a locally built Apple Silicon macOS app, with Finder file opening and platform-specific deletion/update behavior. No new public release or macOS release workflow has been created.

## Recently completed

- v0.1.10: independent side-by-side windows, one window per draft, and an editor context menu for cut/copy/paste/select all.
- Earlier releases provide single-file relative image loading, inline rename, confirmed deletion with Windows undo, external-edit conflict protection, and reading-position persistence. See the changelog for details.
- Main now shares the Markdown filename predicate between drag-and-drop and file discovery; `.md` and `.markdown` remain supported, `.txt` is rejected.
- Local macOS build: `tauri.macos.conf.json` produces an `.app` without updater artifacts. Finder file-open events are retained until the frontend is ready and use the existing single-window routing when the app is running.
- macOS deletion uses the existing trash library's `NsFileManager` method on a background worker. The default Finder/AppleScript method blocked the desktop during acceptance; the replacement was retested. Deleted files can be dragged out of Trash, and the UI no longer promises in-app deletion undo.
- macOS skips startup update checks and explains that automatic updates are unavailable when checked manually.
- CI runs frontend tests/build on Ubuntu and `cargo check --locked` on Windows. See [.github/workflows/ci.yml](../.github/workflows/ci.yml). These checks do not prove macOS support.

## Next engineering work

1. Address macOS hidden-path access without silently widening filesystem permissions. In acceptance, a folder inside `.tmp` worked after selection, but could not be restored after restart or opened cold from Finder; ordinary paths worked. Security configuration changes require separate approval.
2. Broaden acceptance only as needed: exact cursor/scroll restoration, multiwindow concurrency edge cases, Intel Macs, and older macOS versions remain unverified.
3. Plan public macOS distribution, Developer ID signing/notarization, and update delivery separately. No macOS CI/release job exists; release work requires separate authorization.

## Local macOS verification

Tested on Apple Silicon (arm64), macOS 27.0.1:

- `npm test`, `npm run build`, and `cargo check --locked` passed. The release `.app` also built successfully with Cargo's lockfile enforced.
- The installed app launched independently of the development server. Finder default opening of `.md` and `.markdown`, including a cold start on an ordinary path, was checked.
- Opening an existing document did not rewrite it. Relative images rendered, and actual saved UTF-8 Markdown retained the relative image path without `blob:` links.
- Chinese IME composition/selection was confirmed manually by the user; the resulting Chinese text was verified in the saved file.
- External edits reloaded automatically. Concurrent external writes and local edits produced the conflict dialog, paused saving, and preserved the external file until a version was selected.
- A GBK document opened read-only and retained its original bytes.
- A separate document window opened; closing it left the main window running. A normal-path workspace and draft restored on restart.
- A disposable deletion sample was removed from its source folder with responsive UI and a success notification using the system Trash API. Direct inspection of Trash was restricted by macOS; in-app restoration remains unsupported.

These checks establish a local-use baseline, not cross-version or distribution acceptance. Installer delivery, Developer ID signing/notarization, Intel builds, exact reading-position restoration, and all multiwindow race conditions were not tested.

## Platform status and known limits

- **Windows:** v0.1.10 is the recorded released baseline. The release workflow builds x64 NSIS installers and creates a draft release on a version tag, including `Sheaf-Setup-x64.exe`, checksums, and `latest.json`. See [windows-release.yml](../.github/workflows/windows-release.yml). The config also lists MSI, but the release workflow explicitly builds NSIS only.
- Windows installers are currently described as unsigned in the README; see the [code signing policy](../CODE_SIGNING_POLICY.md). This snapshot does not independently revalidate hosted release assets.
- **macOS:** a local arm64 `.app` has been built and checked as recorded above. No Developer ID signature, notarization, public Mac installer, or Mac update delivery is provided.
- A dedicated Markdown document icon is not configured in the macOS bundle. Finder may show a generic document icon or content preview even when Sheaf is the default opener. Custom document icons are deferred.
- macOS deletion undo returns an unsupported-platform error (`restore_from_trash` in src-tauri/src/lib.rs); the frontend does not invoke it on Mac and directs users to drag files out of Trash.
- The update flow has no macOS/Linux restart implementation after installation (src/main.ts). The current release update manifest targets Windows only; local Mac builds report automatic updates as unavailable.
- **Linux:** no release pipeline or desktop acceptance is established.
- Non-UTF-8 documents remain read-only. Single-file mode can display relative images, but inserting new local images requires a workspace-backed draft (`ensureImageTarget` in src/main.ts).
- Browser/PWA restrictions are listed in [README.md](../README.md); they are separate from desktop support.

For the next handoff, update this page with verified results and the actual stopping point; keep historical detail in commits and changelogs.
