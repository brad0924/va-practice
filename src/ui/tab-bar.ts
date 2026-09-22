import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { el, button } from './dom';

/** 導覽列的四格。拼字與問答不在這裡，它們收在複習裡面（`web-tab-bar/01` 決定 2）。 */
export type Tab = 'review' | 'cards' | 'data' | 'stats';

/**
 * 四格的順序、字與去處。與手機版 `mobile/app/_layout.tsx` 同一個順序。
 * `label` 存翻譯檔的 key 而不是字，理由與 `review-view.ts` 的 `RATING_BUTTONS` 相同。
 */
const TABS: { tab: Tab; label: Key; go: (app: App) => void }[] = [
  { tab: 'review', label: 'nav.review', go: (app) => app.showReview() },
  { tab: 'cards', label: 'nav.cards', go: (app) => app.showList() },
  { tab: 'data', label: 'nav.data', go: (app) => app.showData() },
  { tab: 'stats', label: 'nav.stats', go: (app) => app.showStats() },
];

/**
 * 底部導覽列：四格，每格一個圖示加一個詞（`web-tab-bar/01`）。
 *
 * 目前那一格標 `aria-current="page"`，樣式照它上色，測試也照它找——不斷言 class 名
 * （`ADR-0014`），與拼字答題頁 `.slot[aria-current]` 同一個做法。
 *
 * 由 `app.ts` 的 `mount()` 每換一次畫面就重建一次，掛在 `.screen` 旁邊而不是裡面：
 * 拼字與問答島內換頁是把自己那一棵 `.screen` 原地換掉（`replaceWith`），
 * 導覽列放在外面才不會跟著被換掉。
 */
export function tabBar(app: App, current: Tab): HTMLElement {
  const nav = el('nav', 'tab-bar');
  for (const { tab, label, go } of TABS) {
    const item = button('tab', '', () => go(app));
    const active = tab === current;
    if (active) item.setAttribute('aria-current', 'page');
    // 圖示是裝飾，字才是名字。按鈕的名字因此只有那個詞，唸出來不會多一段。
    item.append(icon(tab, active), el('span', 'tab-label', t(label)));
    nav.append(item);
  }
  return nav;
}

// ---------- 圖示 ----------

/**
 * 四個圖示，照手機版那四個 SF Symbols 畫：`graduationcap`、`rectangle.stack`、
 * `gearshape`、`chart.bar`。**平常是線條版，選中那格換成實心版**（決定 7）。
 *
 * 內嵌 SVG 而不是圖檔：顏色吃 `currentColor`，選中與沒選中只靠 CSS 換色，
 * 不必各備兩張圖。一筆一筆用 `createElementNS` 建，不走 `innerHTML`——
 * 這個 app 的畫面一律不經過 HTML 解析（`dom.ts`）。
 */
function icon(tab: Tab, filled: boolean): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true' });
  const paint: Record<string, string> = filled
    ? { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linejoin': 'round' }
    : {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.7',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      };
  const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' };

  if (tab === 'review') {
    svg.append(
      // 帽頂的菱形、底下的帽身、右邊垂下來的穗。帽身上緣比菱形邊低一點，實心版中間才留得出一道縫。
      svgEl('path', { ...paint, d: 'M12 3.5 L22.5 8.75 L12 14 L1.5 8.75 Z' }),
      svgEl('path', {
        ...paint,
        d: 'M6 11.6 V15.8 C6 17.8 8.7 19.4 12 19.4 C15.3 19.4 18 17.8 18 15.8 V11.6 L12 14.7 Z',
      }),
      svgEl('path', { ...line, d: 'M21 9.6 V14.6' }),
    );
  } else if (tab === 'cards') {
    svg.append(
      svgEl('rect', { ...paint, x: '3', y: '8.6', width: '18', height: '12', rx: '2.6' }),
      svgEl('path', { ...line, d: 'M5.6 5.8 H18.4' }),
      svgEl('path', { ...line, d: 'M8.2 3.1 H15.8' }),
    );
  } else if (tab === 'data') {
    // 實心版的中心孔靠 evenodd 挖出來；線條版直接多畫一圈。
    svg.append(
      filled
        ? svgEl('path', {
            fill: 'currentColor',
            'fill-rule': 'evenodd',
            d: `${gearPath()} M15.2 12 A3.2 3.2 0 1 0 8.8 12 A3.2 3.2 0 1 0 15.2 12 Z`,
          })
        : svgEl('path', { ...paint, d: gearPath() }),
    );
    if (!filled) svg.append(svgEl('circle', { ...paint, cx: '12', cy: '12', r: '3.2' }));
  } else {
    svg.append(
      svgEl('rect', { ...paint, x: '3.6', y: '13', width: '4.2', height: '7.6', rx: '1.2' }),
      svgEl('rect', { ...paint, x: '9.9', y: '8', width: '4.2', height: '12.6', rx: '1.2' }),
      svgEl('rect', { ...paint, x: '16.2', y: '3.4', width: '4.2', height: '17.2', rx: '1.2' }),
    );
  }
  return svg;
}

/** 八齒的齒輪外框，圓心在 (12, 12)。每一齒是齒根兩點、齒頂兩點，齒頂比齒根窄一點。 */
function gearPath(): string {
  const teeth = 8;
  const outer = 10.2;
  const inner = 7.9;
  const half = Math.PI / teeth;
  const points: string[] = [];
  for (let index = 0; index < teeth; index += 1) {
    const base = (index / teeth) * Math.PI * 2;
    const corners: [number, number][] = [
      [inner, base - half * 0.62],
      [outer, base - half * 0.34],
      [outer, base + half * 0.34],
      [inner, base + half * 0.62],
    ];
    for (const [radius, angle] of corners) {
      points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`);
    }
  }
  return `M${points.join(' L')} Z`;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
