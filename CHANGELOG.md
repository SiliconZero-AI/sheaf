# Changelog

## 0.1.1 — 2026-08-25

Fixes a way to lose writing. Update if you ever edit your `.md` files outside Sheaf.

- **Autosave no longer overwrites changes made outside Sheaf.** Sheaf now compares the file on disk before writing. If it changed while you were away, autosave stops and asks which version to keep instead of silently replacing it.
- **Files reload when you come back.** Switch to another app, change the file there, switch back — Sheaf picks up the new content and keeps your scroll position. If you also have unsaved edits, it asks first.
- The conflict prompt shows both versions side by side with their length, when each was changed, and their opening line, so the choice is not a guess.

## 0.1.0 — 2026-08-20

First public release. Windows only.

- Open one or more folders and write in a single instant-rendering pane
- Autosave; images land in `images/` next to the draft as relative paths
- Outline, find-in-file, search across open folders
- Export `.md`, `.html`, or print to PDF
- Light / dark themes and a Chinese / English interface
- Windows installer with `.md` file association
