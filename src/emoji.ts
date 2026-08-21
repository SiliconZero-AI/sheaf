// 表情面板：分类 + 中英文搜索。
//
// Vditor 自带的那个面板只有几十个、既没分类也没搜索（数据来自 options.hint.emoji，
// 渲染成一个平铺网格），达不到「像 Notion 那样」的要求，所以自己写一个。
// 数据内嵌，不引任何外部依赖——Sheaf 的铁律是零外链、断网可用。

import { currentLang, onLangChange, t, type Dict, type Lang } from "./i18n";

interface Group {
  /** 会话内稳定的分类 id，不随语言变化——用它当 dataset key，展示文字另走 nameKey */
  id: string;
  nameKey: keyof Dict["emoji"];
  /** 每项：表情 + 空格分隔的关键词（中英文都塞，搜「笑」和搜 smile 都要能中） */
  items: [string, string][];
}

const GROUPS: Group[] = [
  {
    id: "frequent",
    nameKey: "groupFrequent",
    items: [
      ["👍", "赞 好 顶 like thumbsup"],
      ["👌", "好的 ok"],
      ["🙏", "拜托 谢谢 祈祷 please thanks"],
      ["🎉", "庆祝 完成 撒花 party tada"],
      ["✅", "对 完成 勾 check done"],
      ["❌", "错 删除 叉 cross wrong"],
      ["⚠️", "警告 注意 warning"],
      ["🔥", "火 热门 fire hot"],
      ["💡", "想法 灵感 点子 idea bulb"],
      ["📌", "钉 重点 pin"],
      ["🚀", "发布 上线 火箭 rocket ship"],
      ["❤️", "爱心 喜欢 heart love"],
      ["😄", "笑 开心 高兴 smile happy"],
      ["🤔", "思考 想 疑惑 think"],
      ["😅", "苦笑 尴尬 sweat"],
      ["🙂", "微笑 slight smile"],
      ["👀", "看 注意 eyes"],
      ["✨", "闪 亮 新 sparkles"],
      ["⭐", "星 收藏 star"],
      ["🌟", "星星 亮点 glow star"],
    ],
  },
  {
    id: "smileys",
    nameKey: "groupSmileys",
    items: [
      ["😀", "笑 咧嘴 grin"],
      ["😃", "笑 开心 smiley"],
      ["😁", "笑 露齿 beam"],
      ["😆", "大笑 laugh"],
      ["😂", "笑哭 joy"],
      ["🤣", "笑翻 rofl"],
      ["😊", "微笑 害羞 blush"],
      ["😇", "天使 innocent"],
      ["🙃", "倒脸 无奈 upside down"],
      ["😉", "眨眼 wink"],
      ["😍", "爱心眼 喜欢 heart eyes"],
      ["😘", "飞吻 kiss"],
      ["😋", "好吃 yum"],
      ["😎", "酷 墨镜 cool sunglasses"],
      ["🤩", "星星眼 崇拜 star struck"],
      ["🥳", "庆祝 派对 partying"],
      ["😏", "得意 smirk"],
      ["😔", "失落 难过 pensive"],
      ["😢", "哭 伤心 cry"],
      ["😭", "大哭 sob"],
      ["😤", "生气 不服 triumph"],
      ["😡", "愤怒 rage angry"],
      ["🥺", "委屈 求 pleading"],
      ["😱", "震惊 吓 scream"],
      ["😴", "睡 困 sleep"],
      ["🤯", "炸裂 震撼 mind blown"],
      ["🤗", "抱 hug"],
      ["🤫", "嘘 安静 shush"],
      ["🙄", "翻白眼 roll eyes"],
      ["😬", "尴尬 grimace"],
      ["🥹", "感动 忍住 holding back tears"],
      ["😐", "面无表情 neutral"],
      ["🤨", "挑眉 怀疑 raised eyebrow"],
      ["😷", "口罩 生病 mask"],
      ["🤒", "发烧 生病 sick"],
      ["🤠", "牛仔 cowboy"],
      ["🤖", "机器人 robot ai"],
      ["👻", "鬼 ghost"],
      ["💀", "骷髅 完蛋 skull"],
      ["🤡", "小丑 clown"],
    ],
  },
  {
    id: "gestures",
    nameKey: "groupGestures",
    items: [
      ["👎", "踩 不好 thumbsdown"],
      ["👏", "鼓掌 clap"],
      ["🙌", "举手 欢呼 raise hands"],
      ["🤝", "握手 合作 handshake"],
      ["✌️", "耶 胜利 victory"],
      ["🤞", "祈求 好运 fingers crossed"],
      ["👋", "挥手 你好 wave hello"],
      ["💪", "肌肉 加油 muscle strong"],
      ["🫶", "比心 heart hands"],
      ["👉", "指 右 point right"],
      ["👈", "指 左 point left"],
      ["☝️", "指 上 point up"],
      ["✍️", "写 手写 writing"],
      ["🤙", "打电话 call me"],
      ["🖐️", "手掌 hand"],
      ["🫡", "敬礼 salute"],
      ["🧑‍💻", "程序员 敲代码 developer"],
      ["👨‍💼", "上班 职员 office"],
      ["🤷", "耸肩 无奈 shrug"],
      ["🙇", "鞠躬 拜托 bow"],
    ],
  },
  {
    id: "nature",
    nameKey: "groupNature",
    items: [
      ["🐱", "猫 cat"],
      ["🐶", "狗 dog"],
      ["🐼", "熊猫 panda"],
      ["🦊", "狐狸 fox"],
      ["🐻", "熊 bear"],
      ["🐰", "兔 rabbit"],
      ["🐷", "猪 pig"],
      ["🐸", "青蛙 frog"],
      ["🐤", "小鸡 chick"],
      ["🦉", "猫头鹰 owl"],
      ["🐝", "蜜蜂 bee"],
      ["🐢", "乌龟 turtle"],
      ["🐬", "海豚 dolphin"],
      ["🌸", "樱花 花 blossom"],
      ["🌿", "叶 植物 herb"],
      ["🌱", "发芽 新 seedling"],
      ["🌳", "树 tree"],
      ["🍀", "四叶草 幸运 clover"],
      ["🌊", "海浪 wave"],
      ["🌈", "彩虹 rainbow"],
      ["☀️", "太阳 晴 sun"],
      ["🌙", "月亮 夜 moon"],
      ["⛰️", "山 mountain"],
      ["❄️", "雪 冬 snow"],
      ["🌧️", "雨 rain"],
      ["🍂", "落叶 秋 autumn"],
    ],
  },
  {
    id: "food",
    nameKey: "groupFood",
    items: [
      ["☕", "咖啡 coffee"],
      ["🍵", "茶 tea"],
      ["🍺", "啤酒 beer"],
      ["🍷", "红酒 wine"],
      ["🍎", "苹果 apple"],
      ["🍊", "橘子 orange"],
      ["🍉", "西瓜 watermelon"],
      ["🍇", "葡萄 grapes"],
      ["🍜", "面 拉面 noodles"],
      ["🍚", "米饭 rice"],
      ["🍲", "火锅 炖 pot"],
      ["🍕", "披萨 pizza"],
      ["🍔", "汉堡 burger"],
      ["🍟", "薯条 fries"],
      ["🍰", "蛋糕 cake"],
      ["🍩", "甜甜圈 donut"],
      ["🍪", "饼干 cookie"],
      ["🍫", "巧克力 chocolate"],
      ["🥚", "蛋 egg"],
      ["🥟", "饺子 dumpling"],
    ],
  },
  {
    id: "objects",
    nameKey: "groupObjects",
    items: [
      ["📝", "写 笔记 memo note"],
      ["📄", "文档 页 document page"],
      ["📁", "文件夹 folder"],
      ["📚", "书 学习 books"],
      ["📖", "读 书 book"],
      ["✏️", "铅笔 写 pencil"],
      ["🖊️", "笔 pen"],
      ["📷", "相机 拍照 camera"],
      ["🎧", "耳机 headphone"],
      ["💻", "电脑 笔记本 laptop"],
      ["🖥️", "显示器 台式 desktop"],
      ["📱", "手机 phone"],
      ["⌨️", "键盘 keyboard"],
      ["🖱️", "鼠标 mouse"],
      ["💾", "保存 软盘 save floppy"],
      ["🗂️", "归档 分类 files"],
      ["🗑️", "删除 垃圾桶 trash"],
      ["🔑", "钥匙 密钥 key"],
      ["🔒", "锁 私密 lock"],
      ["🔍", "搜索 放大镜 search"],
      ["⏰", "闹钟 时间 alarm"],
      ["📅", "日历 日期 calendar"],
      ["💰", "钱 收入 money"],
      ["🎁", "礼物 gift"],
      ["🔧", "工具 扳手 tool"],
      ["⚙️", "设置 齿轮 setting gear"],
    ],
  },
  {
    id: "symbols",
    nameKey: "groupSymbols",
    items: [
      ["✔️", "对 勾 check"],
      ["➡️", "右箭头 arrow right"],
      ["⬅️", "左箭头 arrow left"],
      ["⬆️", "上箭头 arrow up"],
      ["⬇️", "下箭头 arrow down"],
      ["🔗", "链接 link"],
      ["❓", "问号 question"],
      ["❗", "感叹 重要 exclamation"],
      ["💬", "评论 说 comment speech"],
      ["💭", "想 气泡 thought"],
      ["🔔", "提醒 铃 bell"],
      ["🔕", "静音 mute"],
      ["♻️", "循环 回收 recycle"],
      ["🆕", "新 new"],
      ["🆗", "ok"],
      ["🔴", "红点 red"],
      ["🟢", "绿点 通过 green"],
      ["🟡", "黄点 待定 yellow"],
      ["🔵", "蓝点 blue"],
      ["⚪", "白点 white"],
      ["⚫", "黑点 black"],
      ["🚧", "施工 进行中 construction wip"],
    ],
  },
  {
    id: "work",
    nameKey: "groupWork",
    items: [
      ["📊", "图表 数据 chart"],
      ["📈", "上升 增长 up chart"],
      ["📉", "下降 下滑 down chart"],
      ["🎯", "目标 靶 target goal"],
      ["🏆", "奖杯 第一 trophy"],
      ["🥇", "金牌 第一 gold"],
      ["✈️", "飞机 出差 plane"],
      ["🏠", "家 首页 home"],
      ["🏢", "公司 大楼 office building"],
      ["🚗", "车 car"],
      ["🧭", "指南针 方向 compass"],
      ["🗺️", "地图 map"],
      ["📦", "包裹 打包 package"],
      ["🧩", "拼图 模块 puzzle"],
      ["🔬", "研究 显微镜 research"],
      ["🧪", "实验 试管 experiment"],
      ["⚡", "快 闪电 fast lightning"],
      ["🛠️", "工具 建造 build tools"],
    ],
  },
];

/**
 * 关键词字段本来就中英文混排（如「赞 好 顶 like thumbsup」），按当前语言挑一个词当 tooltip，
 * 不用逐条人工加英文名字段。两种都找不到就退回第一个词——不算错，只是不够贴合当前语言。
 */
function pickLabel(keywords: string, lang: Lang): string {
  const words = keywords.split(" ");
  const match = words.find((word) =>
    lang === "en" ? /^[A-Za-z]/.test(word) : /[一-鿿]/.test(word),
  );
  return match ?? words[0];
}

export class EmojiPicker {
  private panel: HTMLDivElement;
  private input: HTMLInputElement;
  private tabs: HTMLDivElement;
  private grid: HTMLDivElement;
  private active = GROUPS[0].id;

  constructor(private onPick: (emoji: string) => void) {
    this.panel = document.createElement("div");
    this.panel.className = "emoji-panel";
    this.panel.hidden = true;

    this.input = document.createElement("input");
    this.input.type = "search";
    this.input.className = "emoji-search";
    this.input.placeholder = t().emoji.searchPlaceholder;
    this.input.autocomplete = "off";

    this.tabs = document.createElement("div");
    this.tabs.className = "emoji-tabs";
    for (const group of GROUPS) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "emoji-tab";
      tab.dataset.group = group.id;
      tab.textContent = t().emoji[group.nameKey];
      this.tabs.append(tab);
    }

    this.grid = document.createElement("div");
    this.grid.className = "emoji-grid";

    this.panel.append(this.input, this.tabs, this.grid);
    document.body.append(this.panel);

    this.input.addEventListener("input", () => this.render());
    this.tabs.addEventListener("click", (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-group]")?.dataset.group;
      if (!id) return;
      this.active = id;
      this.input.value = "";
      this.render();
    });
    this.grid.addEventListener("click", (event) => {
      const char = (event.target as HTMLElement).closest<HTMLElement>("[data-emoji]")?.dataset.emoji;
      if (!char) return;
      this.onPick(char);
      this.hide();
    });
    this.panel.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => this.hide());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.hide();
    });

    onLangChange(() => {
      this.input.placeholder = t().emoji.searchPlaceholder;
      for (const group of GROUPS) {
        const tab = this.tabs.querySelector<HTMLElement>(`[data-group="${group.id}"]`);
        if (tab) tab.textContent = t().emoji[group.nameKey];
      }
      this.render();
    });
  }

  /** 挂在触发按钮下方；面板贴着窗口右边时自动收回来，别跑到屏幕外 */
  toggle(anchor: HTMLElement): void {
    if (!this.panel.hidden) {
      this.hide();
      return;
    }
    this.render();
    this.panel.hidden = false;
    const box = anchor.getBoundingClientRect();
    const width = this.panel.offsetWidth;
    const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${box.bottom + 6}px`;
    this.input.focus();
  }

  hide(): void {
    this.panel.hidden = true;
  }

  private render(): void {
    const query = this.input.value.trim().toLowerCase();
    const hits: [string, string][] = query
      ? GROUPS.flatMap((g) => g.items).filter(([, keys]) => keys.toLowerCase().includes(query))
      : (GROUPS.find((g) => g.id === this.active) ?? GROUPS[0]).items;

    for (const tab of this.tabs.querySelectorAll<HTMLElement>("[data-group]")) {
      if (!query && tab.dataset.group === this.active) tab.dataset.on = "1";
      else delete tab.dataset.on;
    }

    this.grid.textContent = "";
    if (hits.length === 0) {
      const none = document.createElement("p");
      none.className = "emoji-none";
      none.textContent = t().emoji.noResults;
      this.grid.append(none);
      return;
    }
    for (const [char, keys] of hits) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "emoji-cell";
      button.dataset.emoji = char;
      button.title = pickLabel(keys, currentLang());
      button.textContent = char;
      this.grid.append(button);
    }
  }
}
