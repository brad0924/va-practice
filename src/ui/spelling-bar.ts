import type { App } from '../app';
import { t } from '@core/i18n';
import { el, button } from './dom';

/**
 * 拼字三頁共用的標題列：左邊回複習、中央印「拼字」、右邊去卡片（票 06 決定 3）。
 *
 * 抽成一支而不是各頁自己拼，是因為挑書、答題、成績、還有挑書那頁的零本版本，
 * 四個地方要的是**同一條**標題列。其他四個畫面各自拼自己的，那是因為它們本來就長得不一樣。
 *
 * `.bar-title` 落在正中間靠的是 `.bar:has(.bar-title)` 那條 `1fr auto 1fr`，
 * 左右兩欄等寬——因此標題與那兩顆鈕得一起出現，單獨掛標題會偏到左邊那一格。
 *
 * 右邊那顆「卡片」在答題途中也按得到，跳走時那一輪照樣封存，回來看得到成績
 * （封存的規則在 `spelling-home.ts`，不在這裡）。
 */
export function spellingBar(app: App): HTMLElement {
  return el(
    'header',
    'bar',
    button('bar-action', t('nav.review'), () => app.showReview()),
    el('span', 'bar-title', t('nav.spelling')),
    button('bar-action', t('nav.cards'), () => app.showList()),
  );
}
