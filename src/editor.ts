// Vditor 实例。写作面锁死单栏 IR，不做左右分栏。

import Vditor from "vditor";
import "vditor/dist/index.css";
import { safeAlt } from "./images";
import type { ThemeName } from "./theme";
import { line } from "./icons";
import { currentLang, t } from "./i18n";

/**
 * Vditor 默认从 unpkg 取 lute / 语言包 / 图标，断网和国内网络下就起不来。
 * 指到自己 public/ 里那一份（由 scripts/sync-vditor-assets.mjs 复制），全程零外链。
 * 用 baseURI 算绝对地址：部署到子路径（如 GitHub Pages 的 /仓库名/）也不会错位。
 */
const CDN = new URL("vditor", document.baseURI).href;

/** 主题跟着换：代码块配色 + Vditor 自己的深色类。样式文件同样取自本地那一份 */
export function applyEditorTheme(editor: Vditor, theme: ThemeName): void {
  const dark = theme === "dark";
  // 第二个参数留空 = 不要它的 content-theme，那套颜色我们全接管了，加载了反而打架
  editor.setTheme(dark ? "dark" : "classic", undefined, dark ? "github-dark" : "github");
}

export interface EditorHooks {
  onInput(): void;
  onReady(): void;
  onPickImage(): void;
  onSearch(): void;
  onEmoji(button: HTMLElement): void;
  /** 交给 ImageStore 记账，换回一个能在画布上显示的 blob 地址；返回 null 表示这篇稿子现在插不了图 */
  trackImage(blob: Blob, suggested: string): string | null;
}


/**
 * 图标后面跟一个中文标签。
 * Vditor 是把 icon 原样 innerHTML 进按钮的（dist/index.js:8969），所以不必自己重写整个工具栏。
 * 窄屏时由 CSS 把 span 收起来，只留图标。
 */
function withLabel(icon: string, text: string): string {
  return `${icon}<span>${text}</span>`;
}

/**
 * 用标记把选中的字包起来。Vditor 没有内置高亮/上标/下标这三个按钮，
 * 但语法本身 Lute 是支持的（我们已经把开关打开），所以自己插。
 * 没选中就插一对空标记，光标落在中间接着打字即可。
 */
function wrapSelection(editor: Vditor | null, marker: string, placeholder: string): void {
  if (!editor) return;
  const picked = editor.getSelection();
  // insertValue 是在光标处插入，不是替换选区——原选中的字符不清掉的话会在包裹结果前多留一份
  if (picked) {
    window.getSelection()?.getRangeAt(0)?.deleteContents();
  }
  editor.insertValue(`${marker}${picked || placeholder}${marker}`);
}



function mermaidSample(): string {
  return ["", "```mermaid", "graph TD", `  A[${t().editor.mermaidStart}] --> B[${t().editor.mermaidEnd}]`, "```", "", ""].join(
    "\n",
  );
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** 粘贴进来的截图一律叫 image.png，换成带时间的名字，日后在 images/ 里才认得出谁是谁 */
function nameFor(file: File): string {
  if (!/^image\.\w+$/i.test(file.name)) return file.name;
  const ext = /\.[^.]+$/.exec(file.name)?.[0] ?? ".png";
  return `paste-${stamp()}${ext}`;
}

export function createEditor(root: HTMLElement, hooks: EditorHooks): Vditor {
  let editor: Vditor | null = null;
  editor = new Vditor(root, {
    mode: "ir",
    lang: currentLang() === "zh" ? "zh_CN" : "en_US",
    value: "",
    height: "100%",
    cdn: CDN,
    cache: { enable: false },
    outline: { enable: false, position: "left" },
    preview: {
      // content-theme 那份 CSS 只是把颜色改回 GitHub 浅色，跟我们的主题打架，不加载
      theme: { current: "", path: "" },
      hljs: { style: "github" },
      // Lute 引擎本来就有这几种语法的节点，只是开关默认关着。
      // 常见的轻量 Markdown 解析库默认不支持这几种语法，容易被吐槽「缺语法」；打开即可，不用换引擎。
      markdown: {
        mark: true, // ==高亮==
        sup: true, // X^2^
        sub: true, // H~2~O
        footnotes: true, // [^1]
      },
    },
    toolbarConfig: { pin: true },
    image: { isPreview: true },
    upload: {
      accept: "image/*",
      multiple: true,
      // 拖入和粘贴都走这里（Vditor 没有 handleDataUrl 这个选项，别再往回加）
      handler(files) {
        const picked = [...files].filter((file) => file.type.startsWith("image/"));
        if (picked.length === 0) return t().editor.pasteImageOnly;
        let chunk = "";
        for (const file of picked) {
          const name = nameFor(file);
          const url = hooks.trackImage(file, name);
          // 拿不到地址说明这篇稿子没有可落脚的 images/，原因已经由 hooks 提示过了
          if (!url) return null;
          chunk += `![${safeAlt(name.replace(/\.[^.]+$/, ""))}](${url})\n\n`;
        }
        // handler 是同步的，插入要等 Vditor 把当前这轮输入处理完
        setTimeout(() => {
          editor?.insertValue(chunk);
          hooks.onInput();
        }, 0);
        return null;
      },
    },
    // 图标 + 文字：比纯图标更一眼看得懂，并且每个按钮 hover 还带快捷键。
    // 文案全部现取 t()——语言切换时这个编辑器实例会被销毁重建，重建时这里会用新语言重新求值。
    toolbar: [
      { name: "undo", tip: t().editorToolbar.undo, icon: line("undo") },
      { name: "redo", tip: t().editorToolbar.redo, icon: line("redo") },
      "|",
      { name: "headings", tip: t().editorToolbar.heading, icon: withLabel(line("heading"), t().editorToolbar.heading) },
      { name: "bold", tip: t().editorToolbar.bold, icon: withLabel(line("bold"), t().editorToolbar.bold) },
      { name: "italic", tip: t().editorToolbar.italic, icon: withLabel(line("italic"), t().editorToolbar.italic) },
      { name: "strike", tip: t().editorToolbar.strike, icon: withLabel(line("strike"), t().editorToolbar.strike) },
      {
        name: "mark",
        tip: t().editorToolbar.mark,
        tipPosition: "s",
        icon: withLabel(line("mark"), t().editorToolbar.mark),
        click() {
          wrapSelection(editor, "==", t().editorToolbar.mark);
          hooks.onInput();
        },
      },
      {
        name: "sup",
        tip: t().editorToolbar.sup,
        tipPosition: "s",
        icon: withLabel(line("sup"), t().editorToolbar.sup),
        click() {
          wrapSelection(editor, "^", "2");
          hooks.onInput();
        },
      },
      {
        name: "sub",
        tip: t().editorToolbar.sub,
        tipPosition: "s",
        icon: withLabel(line("sub"), t().editorToolbar.sub),
        click() {
          wrapSelection(editor, "~", "2");
          hooks.onInput();
        },
      },
      "|",
      { name: "quote", tip: t().editorToolbar.quote, icon: withLabel(line("quote"), t().editorToolbar.quote) },
      { name: "list", tip: t().editorToolbar.listUnordered, icon: withLabel(line("list"), t().editorToolbar.listUnordered) },
      { name: "ordered-list", tip: t().editorToolbar.listOrdered, icon: withLabel(line("ordered-list"), t().editorToolbar.listOrdered) },
      { name: "check", tip: t().editorToolbar.check, icon: withLabel(line("check"), t().editorToolbar.check) },
      "|",
      { name: "code", tip: t().editorToolbar.code, icon: withLabel(line("code"), t().editorToolbar.code) },
      { name: "inline-code", tip: t().editorToolbar.inlineCode, icon: withLabel(line("inline-code"), t().editorToolbar.inlineCode) },
      { name: "link", tip: t().editorToolbar.link, icon: withLabel(line("link"), t().editorToolbar.link) },
      {
        name: "insert-image",
        tip: t().editorToolbar.image,
        tipPosition: "s",
        icon: withLabel(line("image"), t().editorToolbar.image),
        click() {
          hooks.onPickImage();
        },
      },
      { name: "table", tip: t().editorToolbar.table, icon: withLabel(line("table"), t().editorToolbar.table) },
      {
        name: "mermaid",
        tip: t().editorToolbar.mermaid,
        tipPosition: "s",
        icon: withLabel(line("chart"), t().editorToolbar.mermaid),
        click() {
          if (!editor) return;
          editor.insertValue(mermaidSample());
          // 光插进去不行：IR 模式下这样生成的代码块只有源码半边，缺预览半边，图画不出来。
          // 整篇重渲染一次才会长出预览半边。setValue 的第二个参数默认 false = 不清撤销栈，
          // 所以 Ctrl+Z 仍然能把这张图撤掉。
          editor.setValue(editor.getValue());
          hooks.onInput();
        },
      },
      {
        name: "wd-emoji",
        tip: t().editorToolbar.emoji,
        tipPosition: "s",
        icon: withLabel(line("emoji"), t().editorToolbar.emoji),
        click(event) {
          // 不拦住的话，这次点击会继续冒泡到 document，
          // 被面板自己的「点外面就关」监听器当场关掉
          event.stopPropagation();
          hooks.onEmoji((event.currentTarget ?? event.target) as HTMLElement);
        },
      },
      "|",
      {
        name: "search",
        tip: `${t().editorToolbar.search} <Ctrl+F>`,
        tipPosition: "s",
        icon: withLabel(line("search"), t().editorToolbar.search),
        click() {
          hooks.onSearch();
        },
      },
    ],
    after: () => {
      hooks.onReady();
    },
    input: () => {
      hooks.onInput();
    },
  });
  return editor;
}
