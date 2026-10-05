# Current engineering state

Snapshot: 2026-09-27. Read this after [AGENTS.md](../AGENTS.md), then use [CONTRIBUTING.md](../CONTRIBUTING.md) to develop.

## Baseline and stopping point

- Version: **0.1.10** in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
- Latest release recorded in [CHANGELOG.md](../CHANGELOG.md): **v0.1.10**, 2026-09-08, at `87c9c31`.
- Main baseline: **`092ca7a`**. At this snapshot, local main matches the locally stored origin/main reference; the remote was not fetched or rechecked.
- Two changes after v0.1.10 are merged but unreleased: Windows Rust CI (`c4ddff3`, #22) and rejecting dragged `.txt` files (`092ca7a`, #23). No version bump follows them yet.
- The current stopping point is a public engineering handoff. No macOS implementation or new release is completed by this documentation change.

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
- CI runs frontend tests/build on Ubuntu and `cargo check --locked` on Windows. See [.github/workflows/ci.yml](../.github/workflows/ci.yml). These checks do not prove macOS support.

## Next engineering work

1. Establish a macOS development baseline on a real Mac: install the documented prerequisites, run tests/build and Rust checks, then launch the desktop app. Record actual results before claiming support.
2. Resolve the known macOS gaps below, then verify file opening/saving, Chinese IME, relative images, external edits, multiple windows, deletion, and restart behavior.
3. Only after that, plan macOS packaging and update delivery. Maintainer decisions are still needed on supported architectures, deletion/undo behavior, and distribution requirements. Release work requires separate authorization.

## Platform status and known limits

- **Windows:** v0.1.10 is the recorded released baseline. The release workflow builds x64 NSIS installers and creates a draft release on a version tag, including `Sheaf-Setup-x64.exe`, checksums, and `latest.json`. See [windows-release.yml](../.github/workflows/windows-release.yml). The config also lists MSI, but the release workflow explicitly builds NSIS only.
- Windows installers are currently described as unsigned in the README; see the [code signing policy](../CODE_SIGNING_POLICY.md). This snapshot does not independently revalidate hosted release assets.
- **macOS:** no build or real-device acceptance is recorded, and there is no macOS CI/release job. Building successfully would still leave runtime and installer acceptance outstanding.
- macOS deletion undo currently returns an unsupported-platform error (`restore_from_trash` in src-tauri/src/lib.rs). English deletion text still says “Recycle Bin” and promises undo (src/i18n/en.ts); behavior and wording need adaptation.
- The update flow has no macOS/Linux restart implementation after installation (src/main.ts). The current release update manifest targets Windows only.
- **Linux:** no release pipeline or desktop acceptance is established.
- Non-UTF-8 documents remain read-only. Single-file mode can display relative images, but inserting new local images requires a workspace-backed draft (`ensureImageTarget` in src/main.ts).
- Browser/PWA restrictions are listed in [README.md](../README.md); they are separate from desktop support.

For the next handoff, update this page with verified results and the actual stopping point; keep historical detail in commits and changelogs.
