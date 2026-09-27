# Agent guide

Sheaf is a local Markdown writing app built with TypeScript, Vite, Vditor IR, and Tauri 2.
Keep changes focused on reliable writing and plain files on disk.

## Start here

1. Read [docs/CURRENT.md](docs/CURRENT.md) for the current baseline, stopping point, and next work.
2. Read [README.md](README.md) for supported behavior, setup, and limitations.
3. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for development and product boundaries.
4. Read [SECURITY.md](SECURITY.md) before changing file access or other security-sensitive behavior.

These public documents are sufficient for project handoff; no machine-local instructions are required.
Check the branch and working-tree diff before editing, and preserve unrelated work.
Keep docs/CURRENT.md current when engineering status or the next task changes.

## Safety boundaries

- Preserve CONTRIBUTING's single-pane IR and no-silent-rewrite rules.
- Never overwrite external edits, bypass save/conflict checks, or report a failed save as successful.
- Preserve non-UTF-8 read-only protection and relative image paths on save.
- Preserve the one-window-per-draft rule and safe persistence across multiple windows.
- Keep the existing parser, dependencies, and style; obtain approval before adding dependencies.
- Obtain explicit approval for destructive operations, history rewrites, security configuration, or release workflow changes.
- Keep secrets, personal data, local absolute paths, private notes, and conversation links out of public content.

## Minimum verification

- Documentation-only changes: review the complete diff, check relative links, and scan for private information.
- Code changes: run `npm test` and `npm run build`.
- Rust/Tauri changes: also run `cargo check --locked` from `src-tauri`.
- Editor, file, window, or installer changes: verify the affected flow in the desktop app on the target OS.
- For editing changes, include Chinese IME input and actual saved-file content in manual checks.
- Report what passed, what was not tested, and any blocker; compilation alone is not desktop acceptance.
- Follow existing bilingual README/changelog conventions when user-visible behavior changes.

## Publication

- Do not push, create tags or releases, or deploy without explicit authorization.
- Before publication, separately check repository changes, outgoing commit messages, PR text, and release/update notes for private information.
- Follow [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md); do not claim an artifact is signed without verification.
- Treat release workflows as publication machinery, not as an ordinary validation command.
