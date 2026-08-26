// 从 CHANGELOG 里抽出某一版的那一段，转成更新框能直接显示的纯文本。
//
// 为什么不让更新框自己去读 CHANGELOG：用户手上那份 App 是**旧版**，它的安装包里
// 只有发布它那天的 CHANGELOG。要告诉他「新版改了什么」，这段文字必须跟着
// latest.json 一起从网上下来。所以由 CI 在发版时抽好、写进清单。
//
// 中英各抽一份：清单的 `notes` 是官方字段（英文），`notesZh` 是我们自己加的，
// 通过 JS 侧的 `update.rawJson` 拿得到。中文界面显示中文那份，缺了就退回英文。
//
// 用法：node scripts/release-notes.mjs 0.1.4 CHANGELOG.md
//       node scripts/release-notes.mjs 0.1.4 CHANGELOG.md --allow-unreleased

/** 「## 0.1.4 — 2026-08-26」「## Unreleased」「## 未发布」都认 */
const HEADING = /^##\s+(.+?)\s*$/;

/** 中日韩字符与全角标点 */
const CJK = "\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef";
/**
 * 夹在两个中日韩字符之间的空格。
 * 只收这一种：「打开 Sheaf 之后」里那两个空格一边是拉丁字母，不会被误伤。
 */
const CJK_GAP = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, "g");

/**
 * 取出某一版的正文。找不到返回 null——调用方决定这算不算致命。
 *
 * `unreleasedAliases` 是给未发版的分支用的：本地跑的时候版本号还没敲定，
 * 段落标题还写着「未发布」。正式发版时标题必须已经是版本号，见下面的 CLI 守卫。
 */
export function extractSection(markdown, version, unreleasedAliases = []) {
  const lines = markdown.split(/\r?\n/);
  const wanted = [version, ...unreleasedAliases];
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(HEADING);
    if (!m) continue;
    if (start >= 0) {
      end = i;
      break;
    }
    // 标题形如「0.1.4 — 2026-08-26」，只比破折号前面那截
    const title = m[1].split("—")[0].trim();
    if (wanted.includes(title)) start = i + 1;
  }

  if (start < 0) return null;
  return toPlainText(lines.slice(start, end));
}

/**
 * Markdown → 纯文本。更新框用 textContent 渲染，留着 `**` 和反引号只会原样显示出来。
 * 保留行首的「- 」，前端据此判断哪些行画成条目。
 */
export function toPlainText(lines) {
  return lines
    .map((line) =>
      line
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        // [文字](链接) → 文字。框里点不了链接，留个地址是噪音
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        // 去掉 ** 之后中文之间会多出一个空格（源文件里那个空格是 Markdown 语法要的）。
        // 只收「中日韩字符 + 空格 + 中日韩字符」这一种，「打开 Sheaf 之后」里的空格不受影响
        .replace(CJK_GAP, "$1")
        .trimEnd(),
    )
    .join("\n")
    .trim();
}

// ---------- CLI ----------

// 用 pathToFileURL 而不是自己拼字符串比：本机路径带空格，import.meta.url 里会是 %20，
// 手写的 endsWith 永远匹配不上（第一版就是这么翻的车，CLI 静默什么都不输出）
const { pathToFileURL } = await import("node:url");
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { readFileSync } = await import("node:fs");
  const [version, file, ...flags] = process.argv.slice(2);
  if (!version || !file) {
    console.error("用法: node scripts/release-notes.mjs <版本号> <CHANGELOG 文件> [--allow-unreleased]");
    process.exit(2);
  }
  const allowUnreleased = flags.includes("--allow-unreleased");
  const aliases = allowUnreleased ? ["Unreleased", "未发布"] : [];
  const text = extractSection(readFileSync(file, "utf8"), version, aliases);
  if (!text) {
    // 发版时抽不出说明就该停：宁可不发，也别推一个「有新版可用」却说不出改了什么的更新
    console.error(`${file} 里没有 ${version} 这一段。发版前要把「未发布」改成正式版本号标题。`);
    process.exit(1);
  }
  process.stdout.write(text);
}
