# Changelog

## 0.1.9 — 2026-08-29

Single-file images and file-panel naming are now complete.

- **Relative images load when a `.md` is opened by double-click or “Open Single File”.** Images in the same folder or a subfolder work with Chinese characters and spaces in their paths; saving keeps the original relative path instead of writing a `blob:` or absolute path.
- **The file panel now supports inline rename.** Right-click and choose “Rename”, or press `F2`; `Enter` confirms and `Esc` cancels. The extension is preserved, while empty, invalid, and duplicate names are rejected in place. The editor, images, outline, autosave, reading position, and restart restore all follow the renamed draft.

## 0.1.8 — 2026-08-28

You can delete drafts from the file panel now, and they go to the Recycle Bin.

- **Right-click any draft in the left panel and there's a "Delete" item.** Getting rid of a scratch file used to mean opening File Explorer and finding it yourself.
- **Deleted files go to the Recycle Bin, not into thin air.** Restore one from there if you change your mind — the same as deleting it in File Explorer.
- **It asks first**, and shows the file name while it asks, so identically named files in different folders don't catch you out.
- **If you delete the draft you're currently in, the canvas moves to the next one**; empty the folder entirely and the canvas clears, rather than leaving a draft pointing at a file that no longer exists.
- **Press Ctrl+Z right after and it comes back**, to exactly where it was; if you deleted the draft you were in, the canvas returns to it too. Only the moment right after counts — start typing and Ctrl+Z goes back to undoing your typing, so it never fires by mistake.
- **Select a draft and press Del** to delete it, through the same confirmation.
- When it can't delete something — the file is open in another program, or already gone — it says so on the spot and leaves the file alone.
- Files only; folders are not deleted.
- One change to how the file panel feels, needed for the above: **clicking a draft now keeps focus in the panel** (as File Explorer and VS Code do), so arrow keys move between drafts and Del works. Press Enter to put the cursor in the text and start writing.

## 0.1.7 — 2026-08-27

Your folders and reading positions no longer depend on browser storage, and the text size is remembered.

- **Upgrading by hand can no longer wipe your workspace.** The list of folders you have open, which draft you had last, and how far you had read used to live inside the browser engine's storage — which the uninstaller's "delete application data" box removes. They now live in a plain `state.json` outside that folder, so ticking that box during an upgrade leaves them alone.
- **Nothing to set up again.** The first time this version starts it copies whatever was in the old location across, then works from the file. Folders you already have open stay open.
- **The text size sticks.** `Ctrl` and `+` or `-` used to reset to 100% every time Sheaf reopened. Whatever size you leave it at is what you get next time.
- If the file is ever damaged — edited by hand, a power cut mid-write — Sheaf still starts, falls back to whatever the old storage still holds, and writes a clean file. It never starts up empty because of a bad byte.
- One thing this cannot fix retroactively: upgrading **to** this version with "delete application data" ticked still loses the old data, because the version you are leaving never wrote the new file. From this version on you are covered.

## 0.1.6 — 2026-08-27

Diagrams and images that are too small to read can now be opened full screen.

- **Hover an image or a diagram and a button appears in its corner.** Click it and the picture opens over the whole window, where you can scroll to zoom, drag to move around, and press `Esc` to go back. Wide flowcharts — the ones squeezed down to fit the writing column until every label ran together — are the reason this exists.
- **It opens at whatever size fits.** Small pictures stay their own size rather than being blown up into a blur; large ones are scaled down until the whole thing is visible. `0` puts it back to that, `+` and `-` step through zoom levels, and the percentage is always on screen.
- Zooming with the scroll wheel keeps whatever is under the pointer under the pointer, so you can aim at a corner of a diagram and go straight in.
- Nothing about how drafts are stored, exported or printed changed — this is a way of looking at a picture, not a change to the page it sits on.

## 0.1.5 — 2026-08-26

Formatting now shows up the moment you apply it, and you can make the text bigger.

- **Bold, italic, strikethrough and links render on the spot.** Selecting text and clicking the toolbar button (or pressing `Ctrl+B` / `Ctrl+I` / `Ctrl+D` / `Ctrl+K`) used to leave the raw Markdown sitting on the page — `~~like this~~` — until you typed somewhere else. Now you see the finished result immediately, which is what a single-canvas editor is supposed to do.
- **You can zoom the text.** `Ctrl` and `+` or `-` makes everything bigger or smaller, `Ctrl+0` puts it back, and holding `Ctrl` while scrolling works too. Useful when a draft is dense or the screen is far away.

## 0.1.4 — 2026-08-26

Sheaf can now update itself.

- **New versions install themselves.** Sheaf checks once shortly after it starts and, when a newer version exists, asks whether to install it. One click downloads it, installs it, and reopens Sheaf where you were. No more visiting the website to find an installer.
- **The check never gets in your way.** It runs quietly in the background — if you are offline, or the check fails, Sheaf says nothing at all. You can also check on demand from the Help panel, which always tells you the result.
- **Your draft is written to disk before anything is installed.** Installing restarts Sheaf, so it saves first. If the draft cannot be saved — an outside change you have not resolved, a file deleted from disk, a failed save — the update stops and says which one it is, instead of restarting on top of your work.
- **The prompt tells you what changed.** It lists this release's notes, in your interface language, so you know what you are installing before you agree to it.
- Your folders and reading positions survive the update.

## 0.1.3 — 2026-08-25

For anyone who edits their drafts with an AI tool while Sheaf is open.

- **Changes made outside Sheaf now show up right away.** You no longer have to switch away and back for Sheaf to notice — save a file from an AI tool or another editor and the open draft updates on its own. Rapid, repeated writes are batched, so a tool that saves several times a second updates the page calmly instead of flickering.
- **Sheaf stays where you were reading.** When a draft reloads, your place is found by the nearest heading rather than by pixel offset, so text added above where you are reading no longer pushes you off your spot.
- **Every draft remembers where you left off.** Switch drafts, or close and reopen Sheaf, and you come back to the place and cursor position you left — instead of the top of the file, or the very end.
- **New files appear in the file list on their own.** A draft created outside Sheaf shows up in the folder without a manual refresh. Sheaf does not switch to it — whatever you are writing stays open.
- **A draft deleted outside Sheaf keeps its text on screen.** Autosave pauses and the status bar says the file is gone from disk. Press `Ctrl+S` to write it back; Sheaf will not recreate it on its own.
- The Help panel covers both of these now, so you can find out what changed without leaving the app.

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
