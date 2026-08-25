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
    howtoTitle: string;
    howtoOpenFolder: string;
    howtoAutosave: string;
    howtoImages: string;
    howtoTable: string;
    howtoExport: string;
    shortcutsTitle: string;
    shortcutFind: string;
    shortcutGlobalFind: string;
    shortcutToggleFiles: string;
    shortcutToggleOutline: string;
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
  };
  conflict: {
    title: string;
    body: (name: string) => string;
    frozen: string;
    keepMine: string;
    keepMineHint: string;
    keepDisk: string;
    keepDiskHint: string;
    later: string;
    closeTitle: string;
    reloaded: string;
    resolvedMine: string;
    resolvedDisk: string;
    reloadFailed: string;
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
