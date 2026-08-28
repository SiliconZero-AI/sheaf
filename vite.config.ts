import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// 版本号只认 package.json 这一个来源，编译期注入。
// 帮助面板里要显示版本，但绝不能在那边手写一份——发版时改了这边忘了那边，
// 用户看到的版本号就是错的，比不显示更糟。
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  base: "./",
  // 端口写死，占用了就直接失败，不许悄悄换一个。
  //
  // 这是 Tauri 官方 Vite 模板的标准配置，我们建仓时漏了，代价是真实发生过的：
  // src-tauri/tauri.conf.json 里 devUrl 写死 5173，而 Vite 默认 strictPort: false，
  // 端口被占时它会自己挪到 5174/5175/…… 并照常打印「ready」——
  // 于是 App 仍旧去连 5173，加载的是别人（上一次没退干净的 dev server）的代码。
  // 界面看着一切正常，跑的却是旧模块图，验收结论整个作废。
  // 宁可在这里响亮地失败，也不要在那里静默地骗人。
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
