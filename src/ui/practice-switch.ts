import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import { el, button } from './dom';

/** 複習畫面底下的三種練法。 */
export type Practice = 'review' | 'spelling' | 'quiz';

const PRACTICES: { practice: Practice; label: Key; go: (app: App) => void }[] = [
  { practice: 'review', label: 'nav.review', go: (app) => app.showReview() },
  { practice: 'spelling', label: 'nav.spelling', go: (app) => app.showSpelling() },
  { practice: 'quiz', label: 'nav.quiz', go: (app) => app.showQuiz() },
];

/**
 * 分段切換：複習｜拼字｜問答（`web-tab-bar/01` 決定 5）。
 *
 * 導覽列只有四格，拼字與問答收進複習裡面，這一排就是它們的入口，也是回複習的路——
 * 拼字與問答的標題列因此不放返回鈕。擺在標題列正下方，三個畫面的每一頁都有，
 * 包括零本與出不了題那幾頁，同一個位置的東西才不會忽有忽無。
 *
 * 目前那一段標 `aria-current="page"`，與導覽列同一個做法（`ADR-0014`）。
 * `role="group"` 讓讀螢幕的人聽得出這三顆是一組；它不是 `<nav>`，畫面上的 `<nav>`
 * 只有底部那一條。
 *
 * 答題途中點別段跳走，那一輪照舊封存——封存的規則在 `spelling-home.ts` 與
 * `quiz-home.ts`，不在這裡，與按導覽列跳走是同一條路。
 */
export function practiceSwitch(app: App, current: Practice): HTMLElement {
  const group = el('div', 'practice-switch');
  group.setAttribute('role', 'group');
  for (const { practice, label, go } of PRACTICES) {
    const item = button('practice-switch-item', t(label), () => go(app));
    if (practice === current) item.setAttribute('aria-current', 'page');
    group.append(item);
  }
  return group;
}
