// 工作区记忆存哪儿：挂了哪些文件夹、上次开哪篇、每篇读到哪、正文缩放到多大。
//
// 两套后端，按运行环境分：
// - 桌面壳：一个 JSON 文件，落在 configDir()/Sheaf/state.json
// - 浏览器：IndexedDB —— 演示站没有文件系统可写，这是唯一选择
//
// 桌面版为什么不能留在浏览器存储里：WebView2 的 IndexedDB 住在
// %LOCALAPPDATA%\<包名>\EBWebView\ 里，而安装向导卸载页上那个默认不勾的
// 「删除应用数据」复选框，一勾就把 %APPDATA%\<包名>\ 和 %LOCALAPPDATA%\<包名>\
// 整个删掉（见 tauri-bundler 生成的 installer.nsi）。用户不走应用内更新器、
// 自己下安装包手动升级时会看到这个框，勾了就得把文件夹重新挂一遍。
//
// 也正因为它是按「包名」精确删的，配置文件必须放在不叫包名的目录里——
// 所以是 %APPDATA%\Sheaf\，不是 Tauri 的 appConfigDir()。后者正好等于
// %APPDATA%\com.siliconzero.sheaf\，跟 IndexedDB 一起死，搬过去等于没搬。

import { exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { configDir, join } from "@tauri-apps/api/path";
import { isDesktop } from "./env";
import { currentLabel } from "./window";

/** 存得下的东西。键名跟 IndexedDB 时代保持一致，浏览器那条路一个字节都没变 */
export type StateKey = "roots" | "root" | "last-file" | "positions" | "zoom";

/** 一份记忆。值故意留成 unknown：真正的格式识别在 fs.ts 的 parseLastFile / parsePositions 里，
 *  那些函数已经有测试，也已经认得历史上的老格式，这里不重复一遍 */
export type StateBag = Partial<Record<StateKey, unknown>>;

/** 文件格式版本。将来结构变了好认——认不出的一律当空的用 */
export const STATE_VERSION = 1;

const FOLDER = "Sheaf";
const FILE_NAME = "state.json";

// ---------- 纯函数（可测，不碰 IO） ----------

/** 缩放比例的合法区间。超出这个范围的一律不认 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;

/**
 * 认不认这个缩放比例。认不出来返回 null（调用方回落到 100%）。
 * 越界一律拒绝而不是夹到边界：将来某版放宽了上限、用户又降回旧版时，
 * 夹边界会让他看到一个自己没设过的怪比例，回到 100% 更好解释。
 */
export function parseZoom(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < ZOOM_MIN || value > ZOOM_MAX) return null;
  // 收到三位小数：devicePixelRatio 除出来常带一长串浮点尾巴，原样写进 JSON 太丑
  return Math.round(value * 1000) / 1000;
}

/**
 * 把文件里读到的东西认成一份记忆。**任何输入都不许抛**——
 * 配置文件被手改坏、写了一半断电、磁盘串位，都不能让 Sheaf 起不来。
 * 认不出的字段直接丢掉，剩下的照用：坏了一个 last-file 不该连工作区一起赔进去。
 */
export function parseState(raw: unknown): StateBag {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const bag: StateBag = {};

  const roots = src.roots;
  if (Array.isArray(roots)) {
    const paths = roots.filter((item): item is string => typeof item === "string" && item !== "");
    if (paths.length > 0) bag.roots = paths;
  }

  // last-file 有两种历史格式：最早是一个裸路径字符串，后来是对象。
  // 两种都往下传，交给 fs.ts 的 parseLastFile 分辨
  const last = src["last-file"];
  if ((typeof last === "string" && last !== "") || (!!last && typeof last === "object")) {
    bag["last-file"] = last;
  }

  const positions = src.positions;
  if (!!positions && typeof positions === "object" && !Array.isArray(positions)) {
    bag.positions = positions;
  }

  const zoom = parseZoom(src.zoom);
  if (zoom !== null) bag.zoom = zoom;

  return bag;
}

/**
 * 文件里那串东西认不认得。
 *
 * broken 分的是两种完全不同的处境，收场也不一样：
 * - broken=false + 空记忆：文件好好的，里面本来就没东西（用户把工作区全关了）。照办，别多事。
 * - broken=true：连 JSON 都不是（手改坏、写一半断电、磁盘串位）。这时候回头去浏览器存储里
 *   找那份旧的救一次——旧数据可能过期，但「过期的工作区」远好过「一个都不剩」。
 */
export function readStateFile(text: string): { bag: StateBag; broken: boolean } {
  try {
    return { bag: parseState(JSON.parse(text)), broken: false };
  } catch {
    return { bag: {}, broken: true };
  }
}

/** 只要记忆、不关心坏没坏的简写 */
export function parseStateText(text: string): StateBag {
  return readStateFile(text).bag;
}

/** 落盘的样子。版本号钉在最前面，人打开这个文件时第一眼就看得到 */
export function serializeState(bag: StateBag): string {
  return `${JSON.stringify({ version: STATE_VERSION, ...bag }, null, 2)}\n`;
}

/** IndexedDB 时代存的那几样，原样读出来的形态 */
export interface LegacyMemory {
  roots?: unknown;
  /** 更早的版本只存一个，键名是单数 */
  root?: unknown;
  lastFile?: unknown;
  positions?: unknown;
}

/**
 * 把 IndexedDB 里那份翻译成配置文件里那份。老用户第一次升上来就靠这一步——
 * 翻译错了等于让所有人重新挂一遍文件夹。
 */
export function stateFromLegacy(legacy: LegacyMemory): StateBag {
  const bag: StateBag = {};

  const paths = Array.isArray(legacy.roots)
    ? legacy.roots.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
  // roots 空着才去看那个单数的老键，别让它把新键顶掉
  if (paths.length === 0 && typeof legacy.root === "string" && legacy.root !== "") {
    paths.push(legacy.root);
  }
  if (paths.length > 0) bag.roots = paths;

  const last = legacy.lastFile;
  if ((typeof last === "string" && last !== "") || (!!last && typeof last === "object")) {
    bag["last-file"] = last;
  }

  const positions = legacy.positions;
  if (!!positions && typeof positions === "object" && !Array.isArray(positions)) {
    bag.positions = positions;
  }

  return bag;
}

/** 空不空。迁移时用它决定「值不值得为这份数据建文件」 */
export function isEmptyState(bag: StateBag): boolean {
  return Object.keys(bag).length === 0;
}

/**
 * 把本窗口改过的那几个键，盖到刚从磁盘读回来的那份上。
 *
 * **这是多窗口能共存的全部理由。** 从前只有一个窗口，落盘时把内存里整份 bag 写下去
 * 天经地义；开了第二个窗口之后，那样做就成了「B 窗口随便存点什么，就把 A 窗口
 * 刚挂上的文件夹抹掉」——因为 B 内存里那份 roots 还是它开机时的快照。
 *
 * 按键分开盖之后，A 只碰 roots、B 只碰 positions，两边各写各的，谁也不动谁。
 * 两个窗口改**同一个**键时仍然是后写的赢——那是真冲突，这里不假装能解决；
 * 代价上限是丢一次「上次读到哪」，不涉及稿件内容。
 *
 * keys 里的键在 mine 里没有值，表示本窗口把它删了（stateSet 传 null 那条路），
 * 所以要从结果里删掉，不能当成「没改过」跳过——不然用户关掉最后一个文件夹之后，
 * 那份记录会被磁盘上的旧值一次次救回来。
 */
export function mergeState(
  base: StateBag,
  mine: StateBag,
  keys: Iterable<StateKey>,
): StateBag {
  const next: StateBag = { ...base };
  for (const key of keys) {
    const value = mine[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

// ---------- 浏览器后端：IndexedDB ----------
//
// 从 fs.ts 原样搬过来，一行没改。库名保持旧值：这是持久化标识，
// 改了等于把已经授权过的文件夹记录全丢掉，每个工作区都要重新授权一遍。

const DB_NAME = "writing-desk";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

// ---------- 桌面后端：一个 JSON 文件 ----------

let cachedPaths: Promise<{ dir: string; file: string; tmp: string }> | null = null;

function statePaths(): Promise<{ dir: string; file: string; tmp: string }> {
  if (!cachedPaths) {
    cachedPaths = (async () => {
      const dir = await join(await configDir(), FOLDER);
      const file = await join(dir, FILE_NAME);
      // 临时文件名带上窗口 label：落盘走的是「先写 .tmp 再改名顶上去」，
      // 两个窗口共用同一个 .tmp 会互相踩——A 刚写一半，B 把它改名走了，
      // 于是 state.json 里躺着半截 JSON，下次开机整份记忆判成「内容坏了」
      return { dir, file, tmp: `${file}.${currentLabel()}.tmp` };
    })();
  }
  return cachedPaths;
}

/** 进程内这一份就是权威。读一次文件之后全在内存里过，切稿时不必再碰磁盘 */
let bag: StateBag = {};
let loaded: Promise<StateBag> | null = null;

/**
 * 读文件那一步是不是失败了（不是「文件不存在」，是真读不动：没权限、被占用、磁盘错）。
 * 是的话就**禁止写**——内存里那份是空的，写下去等于把用户好端端的记忆抹成空白。
 * 这一整个 session 记不住东西，也好过毁掉已经存着的。
 */
let writable = true;

async function readLegacy(): Promise<StateBag> {
  try {
    const [roots, lastFile, positions] = await Promise.all([
      idbGet<unknown>("roots"),
      idbGet<unknown>("last-file"),
      idbGet<unknown>("positions"),
    ]);
    const root = Array.isArray(roots) && roots.length > 0 ? null : await idbGet<unknown>("root");
    return stateFromLegacy({ roots, root, lastFile, positions });
  } catch (error) {
    // 读不到旧数据就当新用户。这里绝不能抛：一抛 Sheaf 就开不起来了
    console.warn("[Sheaf] 读不到旧版记忆，当新用户处理", error);
    return {};
  }
}

async function loadFromDisk(): Promise<StateBag> {
  let path: { dir: string; file: string; tmp: string };
  try {
    path = await statePaths();
  } catch (error) {
    console.warn("[Sheaf] 找不到配置目录，这次不记东西", error);
    writable = false;
    return {};
  }

  try {
    if (await exists(path.file)) {
      const { bag: stored, broken } = readStateFile(await readTextFile(path.file));
      // 文件好好的就以它为准，哪怕里面是空的——用户可能就是把工作区全关了，
      // 这时候拿几个月前的旧数据盖回去，比什么都不做更糟
      if (!broken) return stored;
      console.warn("[Sheaf] 配置文件内容坏了，回头找浏览器存储里那份旧的救一次");
      // 坏了就往下走迁移分支，救回来顺便把坏文件覆盖掉
    }
  } catch (error) {
    console.warn("[Sheaf] 配置文件读不动，这次不记东西", error);
    writable = false;
    return {};
  }

  // 走到这儿只有两种情况：文件不存在（全新用户，或老用户第一次升上来），
  // 或者文件内容坏得连 JSON 都不是。两种都去浏览器存储里搬一份，之后以文件为准。
  // 旧数据留着不删：留着无害，万一配置文件哪天又被谁清掉、或者坏掉，还能再救一次
  const migrated = await readLegacy();
  if (!isEmptyState(migrated)) {
    console.info("[Sheaf] 把工作区记忆从浏览器存储搬进配置文件");
    try {
      await writeBag(migrated);
    } catch (error) {
      // 落不了盘也得把这份记忆用起来（这一趟照样能恢复工作区），下次开机再搬一遍。
      // 这里绝不能让异常冒出去：调用链一路通到 boot()，抛出去就是整个程序起不来
      console.warn("[Sheaf] 记忆搬过来了但写不进配置文件，下次开机再试", error);
    }
  }
  return migrated;
}

function load(): Promise<StateBag> {
  if (!loaded) {
    loaded = loadFromDisk().then((result) => {
      bag = result;
      return bag;
    });
  }
  return loaded;
}

async function writeBag(next: StateBag): Promise<void> {
  const path = await statePaths();
  try {
    await mkdir(path.dir, { recursive: true });
  } catch {
    // 目录已经在就是这个结果，不是错。真建不出来下一步会报
  }
  // 先写临时文件再改名顶上去：这个文件正是本批要保住的东西，
  // 半路断电留下半截 JSON 的话，下次开机它就成了「内容坏了」那一档
  await writeTextFile(path.tmp, serializeState(next));
  await rename(path.tmp, path.file);
}

/**
 * 从磁盘重新读一份最新的。读不动、或者内容坏了就返回 null——
 * 两种都表示「拿不到可信的基准」，调用方据此决定退路。
 *
 * 注意这里不碰 writable：那个开关管的是启动时那次读，
 * 一次临时的读失败不该把整个 session 变成只读。
 */
async function readDisk(): Promise<StateBag | null> {
  try {
    const path = await statePaths();
    if (!(await exists(path.file))) return {};
    const { bag: stored, broken } = readStateFile(await readTextFile(path.file));
    return broken ? null : stored;
  } catch {
    return null;
  }
}

// 落盘不排队等待，但同一时刻只允许一个写在跑：
// 后来的改动记下键名、跟着当前这次一起等，写完再补一遍。
// 不额外加防抖——上层 schedulePositionSave 已经攒了 600ms 一拍，
// 这里再攒一次只会让「关窗口前补最后一次」那条路白等。
//
// 记的是**键名**不是一个脏标记：多窗口下落盘要按键合并（见 mergeState），
// 不知道自己改过哪几个键就没法只盖那几个
let flushing: Promise<void> | null = null;
const pending = new Set<StateKey>();

function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      while (pending.size > 0) {
        const keys = [...pending];
        pending.clear();
        const disk = await readDisk();
        // 读不到可信的基准时退回「只写自己这份」：这一趟可能盖掉别的窗口刚写的东西，
        // 但换成「什么都不写」的话，本窗口的改动也一起没了——而那是用户刚做出来的
        const next = disk ? mergeState(disk, bag, keys) : { ...bag };
        // 内存跟盘上对齐：别的窗口写进去的东西这一刻也一并吸进来，
        // 下次合并才不会拿一份更旧的值去盖人家
        bag = next;
        await writeBag(next);
      }
    } catch (error) {
      console.warn("[Sheaf] 记忆写不进配置文件", error);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// ---------- 对外：两套后端共用的出入口 ----------

/** 取一样记忆。取不到返回 null */
export async function stateGet<T>(key: StateKey): Promise<T | null> {
  if (!isDesktop) return idbGet<T>(key);
  const current = await load();
  return (current[key] as T | undefined) ?? null;
}

/** 存一样记忆。存不进去不抛——大不了这次记不住，不能影响正在写的东西 */
export async function stateSet(key: StateKey, value: unknown): Promise<void> {
  if (!isDesktop) return idbSet(key, value);
  await load();
  if (value === undefined || value === null) delete bag[key];
  else bag[key] = value;
  if (!writable) return;
  pending.add(key);
  await flush();
}

/**
 * 读一样记忆、改一改、再存回去——中间那次「读」保证拿到的是**磁盘上最新的**，
 * 不是本窗口开机时那份快照。
 *
 * 什么时候必须用它而不是 stateSet：这个键是一张大表、而每个窗口只改其中几条时。
 * 阅读位置（positions）正是这样——所有稿子的位置挤在一个键里，每滚一下就重写一次。
 * 用 stateSet 的话，A 窗口写的是「A 开机时看到的全表 + A 这一篇」，
 * 一落盘就把 B 窗口这段时间记下的所有条目抹平了。
 *
 * 这不是万无一失的事务：读和写之间仍有一个极窄的窗口。但落盘走同一条串行队列，
 * 而这类写入本身是用户操作触发的（滚动、切稿），撞上的概率极低，
 * 撞上的代价也只是丢一条「上次读到哪」。为它上文件锁不划算。
 */
export async function stateUpdate(
  key: StateKey,
  change: (current: unknown) => unknown,
): Promise<void> {
  if (!isDesktop) {
    const current = await idbGet<unknown>(key);
    return idbSet(key, change(current));
  }
  await load();
  const disk = await readDisk();
  // 读不到磁盘上那份就拿内存里的顶上：改一份可能过期的数据，
  // 好过因为读不动就干脆不记
  const base = disk ? disk[key] : bag[key];
  const value = change(base);
  if (value === undefined || value === null) delete bag[key];
  else bag[key] = value;
  if (!writable) return;
  pending.add(key);
  await flush();
}
