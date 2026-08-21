# Contributing

Sheaf is a local Markdown writing app. The default writing surface is a single instant-rendering pane (Vditor IR). Please don't turn the main UI into a source-on-the-left / preview-on-the-right split.

## Dev

```bash
npm install
npm run dev
npm test
```

Windows desktop shell (Rust + WebView2):

```bash
npm run tauri dev
npm run tauri build
```

`dev` and `build` copy Vditor runtime files from `node_modules` into `public/vditor/` first. That folder is generated, not committed.

## Pull requests

- Open an issue first if the change is more than a small fix.
- Don't add: theme stores, one-click publishing, fake Word export, extra UI languages beyond Chinese and English, a second Markdown parser.
- Opening an existing `.md` file must not silently rewrite it on disk.

## Bugs

Use the bug report template. If a draft can be lost or corrupted, say so in the title.
