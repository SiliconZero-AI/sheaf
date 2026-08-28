// 词典的形状。zh.ts / en.ts 都必须满足这个接口——
// 两边字段一一对应是靠 TypeScript 结构检查保证的，漏翻译在 `tsc --noEmit` 就会报错。

export type Lang = "zh" | "en";

export interface Dict {
  page: {
    description: string;
  };
  bar: {
    toggleFiles: string;
    openDirTitle: string;
    openDirLabel: string;
    openMoreTitle: string;
    openMenuDirTitle: string;
    openMenuDirHint: string;
    openMenuFileTitle: string;
    openMenuFileHint: string;
    newFileTitle: string;
    newFileLabel: string;
    saveTitle: string;
    saveLabel: string;
    exportTitle: string;
    exportLabel: string;
    exportMdTitle: string;
    exportMdHint: string;
    exportHtmlTitle: string;
    exportHtmlHint: string;
    exportPrintTitle: string;
    exportPrintHint: string;
    toggleOutline: string;
    help: string;
  };
  theme: {
    toDark: string;
    toLight: string;
  };
  lang: {
    toEn: string;
    toZh: string;
  };
  pane: {
    files: string;
    outline: string;
  };
  dropzone: {
    title: string;
    body: string;
    tip: string;
  };
  search: {
    placeholder: string;
    prevTitle: string;
    nextTitle: string;
    closeTitle: string;
  };
  globalSearch: {
    placeholder: string;
    closeTitle: string;
    noFolders: string;
    scanningStart: (total: number) => string;
    searching: (matched: number) => string;
    scanning: (matched: number, scanned: number, total: number) => string;
    notFound: (query: string) => string;
    found: (matched: number, hits: number) => string;
  };
  help: {
    whatTitle: string;
    whatBody: string;
    highlightsTitle: string;
    highlightDisk: string;
    highlightWysiwyg: string;
    highlightPlainMd: string;
    highlightNative: string;
    highlightTools: string;
    /** 外部改动实时同步：本项目已锁定的产品定位，帮助面板里得说得出来 */
    highlightLiveSync: string;
    howtoTitle: string;
    howtoOpenFolder: string;
    howtoAutosave: string;
    howtoImages: string;
    howtoTable: string;
    howtoExport: string;
    /** 每篇记住上次读到哪 */
    howtoResume: string;
    howtoDelete: string;
    howtoZoomDiagram: string;
    howtoUpdate: string;
    shortcutsTitle: string;
    shortcutFind: string;
    shortcutGlobalFind: string;
    shortcutToggleFiles: string;
    shortcutToggleOutline: string;
    shortcutZoom: string;
    shortcutZoomReset: string;
    versionLabel: string;
  };
  tree: {
    resumeHint: string;
    resumeTitle: (name: string) => string;
    emptyHint: string;
    pickButton: string;
    removeTitle: string;
  };
  outline: {
    empty: string;
    untitled: string;
  };
  status: {
    noFile: string;
    readonly: (encoding: string) => string;
    saving: string;
    unsaved: string;
    savedAt: (time: string) => string;
    /** 外部改动待处理：在用户选定留哪份之前，这篇一律不写盘 */
    conflict: string;
    /** 这篇在磁盘上已经没了：内容留在画布上，但不再自动写回去 */
    missing: string;
  };
  conflict: {
    title: string;
    /** 文件名单独走 <code>，所以这里只有后半句 */
    bodyTail: string;
    frozen: string;
    mineLabel: string;
    mineWhat: string;
    diskLabel: string;
    diskWhat: string;
    /** 「1 066 字 · 21:27 你改的」——字数和时间就是选择的依据 */
    mineMeta: (chars: string, time: string) => string;
    diskMeta: (chars: string, time: string) => string;
    /** 时间戳读不出来时的占位 */
    unknownTime: string;
    emptyHead: string;
    later: string;
    closeTitle: string;
    reloaded: string;
    resolvedMine: string;
    resolvedDisk: string;
    reloadFailed: string;
  };
  update: {
    title: string;
    /** 「Sheaf 0.1.4 可用，你现在装的是 0.1.3」——两个版本号并排放，用户才知道自己在从哪跳到哪 */
    body: (from: string, to: string) => string;
    now: string;
    later: string;
    closeTitle: string;
    /** 下载中。总长度未知时 total 为 null（服务端没给 Content-Length） */
    progress: (received: string, total: string | null) => string;
    /** 装之前那道闸把人拦下来时的解释。三种原因各有各的出路，不能合并成一句 */
    blockedConflict: string;
    blockedMissing: string;
    blockedUnsaved: string;
    /** 下载或安装本身失败 */
    failed: string;
    /** 更新期间不会丢稿的安抚话，跟冲突框的 frozen 同一个位置、同一个优先级 */
    safe: string;
    /** 帮助面板里那个按钮 */
    checkLabel: string;
    checking: string;
    upToDate: string;
    checkFailed: string;
  };
  /** 删除文件：右键菜单那一项 + 确认框 + 删完/删不掉的反馈 */
  del: {
    /** 右键菜单里的那一项 */
    menu: string;
    title: string;
    cancel: string;
    /** 主按钮写「移到回收站」而不是「删除」——说清去了哪儿，用户才敢按 */
    confirm: string;
    closeTitle: string;
    /** 「会移到回收站，之后还能还原」。这是本框最要紧的一句：它决定用户按不按 */
    safe: string;
    /** 删成功后的提示，带文件名 */
    done: (name: string) => string;
    /** 删不掉（被别的程序占用、只读、没权限）。原因原文进控制台，这里只给人话 */
    failed: string;
    /** Ctrl+Z 把刚删的那篇捞回来了 */
    undone: (name: string) => string;
    /** 捞不回来：已被人从回收站清掉、原位置又出现了同名文件、或者这个系统没有还原能力 */
    undoFailed: string;
  };
  meta: {
    charCount: (n: number) => string;
    pendingImages: (n: number) => string;
    relativeImages: string;
  };
  tip: {
    noWorkspaceForImage: string;
    imagesStuck: (n: number) => string;
    saveFailed: string;
    needFolderForNewFile: string;
    unsavedBeforeNew: string;
    newFileFailed: string;
    alreadyInList: (name: string) => string;
    noMdInFolderUnsaved: (name: string) => string;
    noMdInFolder: (name: string) => string;
    workspaceMemoryFailed: string;
    removedFromList: (name: string) => string;
    readonlyEncoding: (encoding: string) => string;
    unsavedBeforeSwitch: string;
    /** 正开着的这篇被外部删掉了。内容还在画布上，等用户按 Ctrl+S 才写回去 */
    fileMissing: string;
    /** 用户按了 Ctrl+S，把被删的那篇重新写回磁盘 */
    fileRestored: string;
    openFailed: string;
    pickerBusy: string;
    pickerOpeningDir: string;
    pickerOpeningFile: string;
    pickerUnsupported: string;
    pickerFailed: (name: string, message: string) => string;
    unknownError: string;
    unsavedBeforeOpen: string;
    dropRejected: string;
    dropUnsupported: string;
    restoreBroken: (n: number) => string;
    printHint: string;
  };
  export: {
    untitled: string;
    mdFilterName: string;
    htmlFilterName: string;
  };
  emoji: {
    searchPlaceholder: string;
    noResults: string;
    groupFrequent: string;
    groupSmileys: string;
    groupGestures: string;
    groupNature: string;
    groupFood: string;
    groupObjects: string;
    groupSymbols: string;
    groupWork: string;
  };
  lightbox: {
    open: string;
    zoomIn: string;
    zoomOut: string;
    fit: string;
    close: string;
  };
  tableToolbar: {
    insertRowBelow: string;
    insertColumnRight: string;
    deleteRow: string;
    deleteColumn: string;
  };
  editorToolbar: {
    undo: string;
    redo: string;
    heading: string;
    bold: string;
    italic: string;
    strike: string;
    mark: string;
    sup: string;
    sub: string;
    quote: string;
    listUnordered: string;
    listOrdered: string;
    check: string;
    code: string;
    inlineCode: string;
    link: string;
    image: string;
    table: string;
    mermaid: string;
    emoji: string;
    search: string;
  };
  editor: {
    pasteImageOnly: string;
    mermaidStart: string;
    mermaidEnd: string;
  };
  fsError: {
    dirNotFound: (path: string) => string;
    fileNotFound: (path: string) => string;
  };
  welcome: string;
}
