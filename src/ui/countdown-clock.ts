import { el } from './dom';

/** 剩幾秒轉黃、剩幾秒轉紅（拼字票 03 決定 3）。 */
const SOON_SECONDS = 5;
const URGENT_SECONDS = 3;

/** 碼表那一圈的半徑與周長。周長算一次就好，dash 的兩個屬性都吃它。 */
const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * 答題畫面右上角那個碼表：一圈倒數，剩幾秒轉黃轉紅。
 *
 * 拼字與問答共用這一支（問答 spec 實作決定七：「碼表的樣子與拼字同一種」）。
 * 抽出來而不是各抄一份，理由與問答直接呼叫拼字的 `points()` 相同：兩邊要的是**同一種**，
 * 抄一份的話日後調了一邊，另一邊不會跟著動。
 *
 * 這一支只管畫，不管時間：什麼時候開始、還剩幾秒，由答題畫面自己量好再遞進來。
 * 它因此不需要計時器，也就沒有拆卸的問題。
 */
export function countdownClock(): { element: HTMLElement; paint(left: number, limit: number): void } {
  const number = el('span', 'clock-num');
  const { svg, run } = clockRing();
  const element = el('div', 'clock', svg, number);

  function paint(left: number, limit: number): void {
    const safe = Math.max(0, left);
    number.textContent = safe.toFixed(1);
    run.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - safe / limit)));
    element.className =
      'clock' + (safe <= URGENT_SECONDS ? ' urgent' : safe <= SOON_SECONDS ? ' soon' : '');
  }

  return { element, paint };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 碼表那兩圈：固定的底，加上一圈會縮的。縮的那一圈由 `paint()` 改 `stroke-dashoffset`。
 *
 * `createElementNS` 不能省——SVG 不吃 `el()` 背後的 `createElement`，用錯的話瀏覽器
 * 會建出一顆長得像 SVG 的 HTML 元素，畫面上什麼都不會出現。
 */
function clockRing(): { svg: SVGSVGElement; run: SVGCircleElement } {
  const circle = (className: string): SVGCircleElement => {
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('class', className);
    node.setAttribute('cx', '23');
    node.setAttribute('cy', '23');
    node.setAttribute('r', String(RING_RADIUS));
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke-width', '3');
    return node;
  };

  const run = circle('ring-run');
  run.setAttribute('stroke-linecap', 'round');
  run.setAttribute('stroke-dasharray', String(RING_LENGTH));
  run.setAttribute('stroke-dashoffset', '0');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 46 46');
  svg.setAttribute('width', '46');
  svg.setAttribute('height', '46');
  svg.append(circle('ring-track'), run);
  return { svg, run };
}
