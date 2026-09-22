import type { App } from '../app';
import { t } from '@core/i18n';
import { el } from './dom';
import { practiceSwitch } from './practice-switch';

/**
 * 問答每一頁頂上的那兩樣：標題列中央印「問答」，底下一排分段切換（複習｜拼字｜問答）。
 *
 * 形狀照抄 `spelling-bar.ts`，理由也一樣：答題、成績、出不了題那一頁要的是**同一組**，
 * 回傳 fragment 的理由也寫在那一支。標題列上原本往拼字、往卡片那兩顆鈕
 * （問答 spec 實作決定九），底部導覽列接手之後拿掉了（`web-tab-bar/01`）。
 *
 * 分段切換在答題途中也按得到，跳走時那一輪照樣封存，回來看得到成績
 * （封存的規則在 `quiz-home.ts`，不在這裡）。
 */
export function quizBar(app: App): DocumentFragment {
  const top = document.createDocumentFragment();
  top.append(el('header', 'bar', el('span', 'bar-title', t('nav.quiz'))), practiceSwitch(app, 'quiz'));
  return top;
}
