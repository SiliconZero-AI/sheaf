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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
