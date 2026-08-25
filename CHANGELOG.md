# Changelog

## 0.1.2 — 2026-08-25

Four small things that were quietly in the way.

- **Sheaf shows its version now.** It sits at the bottom of the Help panel, so you can tell which build you have without digging through file properties.
- **A `.md` you opened on its own comes back when you relaunch.** Only drafts inside a folder used to be remembered — open a single loose file, close Sheaf, and you would come back to something else. Now you return to the file you were actually in.
- **Double-clicking a `.md` brings the window to the front, ready to type.** Sheaf already switched to the file, but the window stayed behind whatever you were looking at, so it looked like nothing had happened. It now restores itself from the taskbar, comes forward, and takes the keyboard — no click needed first.
- **Opening a file that lives in one of your folders now treats it as part of that folder.** Double-click, drag in, or open a single file that sits inside a folder you already have open, and Sheaf now highlights it in the file list and resolves its images. Previously it was treated as an unattached file, which meant images written as relative paths did not load.

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
