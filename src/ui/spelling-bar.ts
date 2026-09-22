import type { App } from '../app';
import { t } from '@core/i18n';
import { el } from './dom';
import { practiceSwitch } from './practice-switch';

/**
 * 拼字每一頁頂上的那兩樣：標題列中央印「拼字」，底下一排分段切換（複習｜拼字｜問答）。
 *
 * 標題列上原本左右各一顆往隔壁的鈕（票 06 決定 3），底部導覽列接手之後拿掉了
 * （`web-tab-bar/01`）。回複習走分段切換的「複習」那一段，或導覽列的「複習」那一格。
 *
 * 抽成一支而不是各頁自己拼，是因為挑書、答題、成績、還有挑書那頁的零本版本，
 * 四個地方要的是**同一組**。問答那幾頁同樣共用一支（`quiz-bar.ts`）。
 *
 * 回傳 `DocumentFragment` 而不是一個元素：兩樣都得是 `.screen` 的直接子節點——
 * 手機橫著拿時切兩欄那一條（`styles.css` 的 `max-height` 那一段）靠 `.screen > .bar`
 * 與 `.screen > .practice-switch` 讓它們橫跨上方。每一頁拿到之後都是直接
 * `screen.append()`，因此換成 fragment 那幾個呼叫端一行都不必改。
 *
 * 分段切換在答題途中也按得到，跳走時那一輪照樣封存，回來看得到成績
 * （封存的規則在 `spelling-home.ts`，不在這裡）。
 */
export function spellingBar(app: App): DocumentFragment {
  const top = document.createDocumentFragment();
  top.append(el('header', 'bar', el('span', 'bar-title', t('nav.spelling'))), practiceSwitch(app, 'spelling'));
  return top;
}
