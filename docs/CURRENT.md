# Current engineering state

Snapshot: 2026-10-20. Read this after [AGENTS.md](../AGENTS.md), then use [CONTRIBUTING.md](../CONTRIBUTING.md) to develop.

## Baseline and stopping point

- Version: **0.1.10** in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
- Latest release recorded in [CHANGELOG.md](../CHANGELOG.md): **v0.1.10**, 2026-09-08, at `87c9c31`.
- Main baseline before the macOS changes: **`61f740c`**, including the public engineering handoff, Windows validation notes, and local archive ignore rule. The macOS changes recorded below remain unreleased.
- Two changes after v0.1.10 are merged but unreleased: Windows Rust CI (`c4ddff3`, #22) and rejecting dragged `.txt` files (`092ca7a`, #23). No version bump follows them yet.
- The current stopping point is a locally built Apple Silicon macOS app, with Finder file opening and platform-specific deletion/update behavior. No new public release or macOS release workflow has been created.

## Windows checkout validation — 2026-10-05

- A local checkout at main `293d12a` was validated using an isolated working copy. The baseline and original working files were preserved; no application code, dependency declarations, release workflow or installed app was changed. This does not refresh the separately dated repository snapshot above or recheck the remote.
- Existing `npm test` completed 366 checks with zero failures, followed by the complete `npm run build` TypeScript check and Vite production build. Node 24.14.0, TypeScript 7.0.2 and Vite 8.2.1 were used with existing dependencies; no npm install was performed.
- `cargo check --locked --offline` passed on Windows with Rust/Cargo 1.97.1 and the existing Visual Studio 2022 Build Tools environment loaded only into the validation process. All outputs were isolated. This is a Rust compilation check, not an installer build or native desktop acceptance.
- Chromium browser checks at 1200×800 and 1024×768 completed: 30 passed and 2 strict export-byte comparisons failed. An actual isolated browser-owned FileSystemFileHandle was used to verify that opening does not rewrite the document, Chinese text is autosaved, headings render, and theme, language, help, search and file-pane controls work. The remaining difference is formatting: recreating Vditor after a language switch removes extra blank lines in the exported Markdown; all nonblank Markdown lines remain identical to the saved document. The byte-equality failures are retained; no fix is claimed.
- Native Windows windows, real Chinese IME, native file watching/conflicts, Recycle Bin undo, installers and updates were not exercised. Browser file selection was directed to a test-only OPFS handle; service workers were blocked, so PWA installation/caching was not validated. No user drafts or application state were accessed by the running app, and the temporary preview was closed. Existing platform limits and next engineering work below remain unchanged.

## Windows native follow-up — 2026-10-05

This later follow-up adds native Windows checks to the earlier browser-only validation. It is partial acceptance; the browser export-formatting failures remain unresolved.

- `cargo build --locked --offline` succeeded in a disposable working copy using existing dependencies; no installer was built. A native Tauri window was exercised through its actual filesystem bridge. The recorded checks contain 22 passes and 1 failure, including repeated checks across separate runs. Reading a test draft, opening without rewriting it, autosave, Ctrl+S, and reopening earlier saved content passed.
- Manual Chinese IME input produced composition-start and composition-end events, and the entered text was verified in the saved test Markdown. Closing and reopening after this latest input was not completed, so full Chinese IME acceptance remains pending.
- The test copy used a distinct application identity, state directory and WebView2 profile, with no update endpoints configured. This was isolation by configuration, not an operating-system boundary preventing access to real application data.
- The real application's state-file and WebView2-profile metadata differed from their original baselines; the preservation check failed. Some observed writes preceded the manual-input retry launch. Without write-process tracing, the source of the changes remains unknown. Real state/profile contents were not inspected, repaired, rolled back or deleted by the validation work; unchanged real application data cannot be claimed.
- Source checkouts, Git metadata, existing dependencies/build caches and the installed executable remained unchanged in the recorded preservation checks. Temporary executables, test drafts, build/browser caches and isolated settings were removed after the test processes exited. The original application and project files were retained.
- Installed-version behavior, production configuration, file associations, native selection dialogs, file watching/conflicts, Recycle Bin undo, installers and updates were not accepted by this follow-up. Before treating Windows validation as complete, review the unresolved preservation check and finish the latest-input restart check under an agreed data-protection boundary. Existing macOS and release work below remains separately scoped.

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
