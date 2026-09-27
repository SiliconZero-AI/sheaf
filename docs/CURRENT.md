# Current engineering state

Snapshot: 2026-09-27. Read this after [AGENTS.md](../AGENTS.md), then use [CONTRIBUTING.md](../CONTRIBUTING.md) to develop.

## Baseline and stopping point

- Version: **0.1.10** in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
- Latest release recorded in [CHANGELOG.md](../CHANGELOG.md): **v0.1.10**, 2026-09-08, at `87c9c31`.
- Main baseline: **`092ca7a`**. At this snapshot, local main matches the locally stored origin/main reference; the remote was not fetched or rechecked.
- Two changes after v0.1.10 are merged but unreleased: Windows Rust CI (`c4ddff3`, #22) and rejecting dragged `.txt` files (`092ca7a`, #23). No version bump follows them yet.
- The current stopping point is a public engineering handoff. No macOS implementation or new release is completed by this documentation change.

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
