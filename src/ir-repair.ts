// IR 模式下工具栏行内标记的补渲染判定。
// 纯逻辑单独放一份是为了能进 test/run.cjs 编译清单——editor.ts 带着 vditor 的
// import，脱离 tsconfig 单文件编译不了。

/**
 * 这几个按钮插完标记后画布上会留下裸语法，必须再逼一次重解析。原因分两种：
 *
 * - `bold` / `italic` / `strike`：Vditor 把光标占位符 `<wbr>` 插在开标记和文字之间
 *   （`**<wbr>文字<wbr>**`）。Lute 按 GFM 判定开标记是否「左侧成对」，要求它后面
 *   紧跟非空白文字；中间夹了一个 `<wbr>` 行内节点就不算，整串退化成裸语法。
 *   实测：`**文字**<wbr>`、`<wbr>**文字**`、`**文字<wbr>**` 三种摆法 Lute 都认，
 *   只有 `**<wbr>文字` 这一种不认。
 * - `link`：Vditor 插完 `[文字](https://<wbr>)` 之后压根没调用 IR 的 input()，
 *   块级内容根本没送去解析。跟 `<wbr>` 位置无关。
 *
 * 两种都是「等下一次输入才补渲染」，正面违反单栏 IR 所见即所得。
 */
const NEEDS_RERENDER: ReadonlySet<string> = new Set(["bold", "italic", "strike", "link"]);

/** Vditor 给「当前光标已在这种标记里」的按钮加的类，点它走的是取消标记那条路 */
export const CLASS_CURRENT = "vditor-menu--current";
/** Vditor 给「此处不能用这个标记」的按钮加的类（比如光标在代码块里） */
export const CLASS_DISABLED = "vditor-menu--disabled";

/**
 * 点了工具栏某个按钮之后，要不要再逼一次重解析。
 *
 * @param type 按钮的 data-type
 * @param classes 按钮当前带的类名
 */
export function needsRerender(type: string | null | undefined, classes: Iterable<string>): boolean {
  if (!type || !NEEDS_RERENDER.has(type)) return false;
  for (const name of classes) {
    // 取消标记那条路走的是 removeInline，本来就会重解析，不用管
    if (name === CLASS_CURRENT) return false;
    // 按钮是灰的，这次点击 Vditor 自己就会忽略
    if (name === CLASS_DISABLED) return false;
  }
  return true;
}
