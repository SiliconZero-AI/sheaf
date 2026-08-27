// 工具栏图标：全部自画的线条图标，统一 24×24 网格、1.8 描边、圆角端点。
//
// 为什么不用 Vditor 自带那套：它是实心 fill 型，而我们自己画的图片/查找等是线条型，
// 两种风格并排摆，怎么调色都显得杂——这才是「图标质感差」的真正来源。
// 统一成一套之后才谈得上质感。

const ICON: Record<string, string> = {
  undo: '<path d="M4 9h11a5 5 0 0 1 0 10h-6"/><path d="M8 5 4 9l4 4"/>',
  redo: '<path d="M20 9H9a5 5 0 0 0 0 10h6"/><path d="M16 5l4 4-4 4"/>',
  heading: '<path d="M6 5v14M18 5v14M6 12h12"/>',
  bold: '<path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M15 5h-6M14 19H8M14.5 5l-5 14"/>',
  strike: '<path d="M4 12h16"/><path d="M8.5 8.5A3.5 3.5 0 0 1 12 6c2 0 3.4.9 4 2.3"/><path d="M15 15.2A3.6 3.6 0 0 1 12 18c-2.2 0-3.7-1-4.3-2.6"/>',
  mark: '<path d="M4 20h16"/><path d="m6.5 16 8.2-8.2a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8L11 20.5"/><path d="M12.5 10 17 14.5"/>',
  sup: '<path d="M5 19V7"/><path d="M5 7h5.5a3 3 0 0 1 0 6H5"/><path d="M10 13l4 6"/><path d="M17 8V4.5h3v3h-3z"/>',
  sub: '<path d="M5 17V5"/><path d="M5 5h5.5a3 3 0 0 1 0 6H5"/><path d="M10 11l4 6"/><path d="M17 20v-3.5h3v3h-3z"/>',
  quote: '<path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5v3A1.5 1.5 0 0 0 5.5 13H8v1.5A2.5 2.5 0 0 1 5.5 17"/><path d="M20 7h-3.5A1.5 1.5 0 0 0 15 8.5v3a1.5 1.5 0 0 0 1.5 1.5H19v1.5a2.5 2.5 0 0 1-2.5 2.5"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1.1"/><circle cx="4.5" cy="12" r="1.1"/><circle cx="4.5" cy="17" r="1.1"/>',
  "ordered-list": '<path d="M10 7h10M10 12h10M10 17h10"/><path d="M4 6.5 5.5 6v4"/><path d="M3.6 15.6c.2-.7.9-1.1 1.6-1 .8.2 1.1 1 .6 1.6L3.7 18.4H6"/>',
  check: '<rect x="3.5" y="4.5" width="7" height="7" rx="1.8"/><path d="m5.3 8 1.5 1.5 2.4-2.6"/><path d="M14 8h6"/><rect x="3.5" y="13" width="7" height="7" rx="1.8"/><path d="M14 16.5h6"/>',
  code: '<path d="m8 8-4.5 4L8 16"/><path d="m16 8 4.5 4-4.5 4"/><path d="m13.5 5-3 14"/>',
  "inline-code": '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="m9 10-2 2 2 2M15 10l2 2-2 2"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.6 6.7"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.4"/><path d="m21 15.5-4.6-4.6L9 18.5"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M9 10v9M15 10v9"/>',
  chart: '<rect x="8.5" y="3" width="7" height="5" rx="1.5"/><rect x="2.5" y="16" width="7" height="5" rx="1.5"/><rect x="14.5" y="16" width="7" height="5" rx="1.5"/><path d="M12 8v3.5M6 16v-2.5h12V16"/>',
  emoji: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1.1"/><circle cx="15" cy="10" r="1.1"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  "row-plus": '<rect x="4" y="5" width="16" height="6" rx="1.5"/><path d="M12 15v6M9 18h6"/>',
  "col-plus": '<rect x="5" y="4" width="6" height="16" rx="1.5"/><path d="M15 9h6M18 6v6"/>',
  "row-minus": '<rect x="4" y="5" width="16" height="6" rx="1.5"/><path d="M9 18h6"/>',
  "col-minus": '<rect x="5" y="4" width="6" height="16" rx="1.5"/><path d="M15 9h6"/>',
  expand: '<path d="M9 4H4v5"/><path d="M15 4h5v5"/><path d="M15 20h5v-5"/><path d="M9 20H4v-5"/><path d="m4.8 4.8 4.4 4.4M19.2 4.8l-4.4 4.4M19.2 19.2l-4.4-4.4M4.8 19.2l4.4-4.4"/>',
  "zoom-in": '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M11 8.5v5M8.5 11h5"/>',
  "zoom-out": '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M8.5 11h5"/>',
  fit: '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M15 20v-5h5"/><path d="M9 20v-5H4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lang: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.3 4 5.2 4 8.5s-1.4 6.2-4 8.5c-2.6-2.3-4-5.2-4-8.5s1.4-6.2 4-8.5z"/>',
};

/** 统一风格的线条图标；未登记的名字会抛错，免得静默画出个空框 */
export function line(name: string): string {
  const body = ICON[name];
  if (!body) throw new Error(`图标未登记：${name}`);
  return `<svg class="wd-line-icon" viewBox="0 0 24 24">${body}</svg>`;
}
