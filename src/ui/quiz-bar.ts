import type { App } from '../app';
import { t } from '@core/i18n';
import { el, button } from './dom';

/**
 * 問答每一頁共用的標題列：左邊回拼字、中央印「問答」、右邊去卡片（spec 實作決定九）。
 *
 * 導覽順序是「複習 → 拼字 → 問答 → 卡片」，因此左邊接的是拼字而不是複習。
 * 形狀照抄 `spelling-bar.ts`，理由也一樣：答題、成績、出不了題那一頁要的是**同一條**。
 *
 * 右邊那顆「卡片」在答題途中也按得到，跳走時那一輪照樣封存，回來看得到成績
 * （封存的規則在 `quiz-home.ts`，不在這裡）。
 */
export function quizBar(app: App): HTMLElement {
  return el(
    'header',
    'bar',
    button('bar-action', t('nav.spelling'), () => app.showSpelling()),
    el('span', 'bar-title', t('nav.quiz')),
    button('bar-action', t('nav.cards'), () => app.showList()),
  );
}
