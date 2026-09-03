/**
 * 一個問句、三顆按鈕的彈窗。回一個 `Promise`，使用者按了哪一顆就回哪一個值。
 *
 * ## 為什麼不用 `confirm()`
 *
 * 這個 app 其他每一個確認都走 `confirm()`，那樣最省事。但它只有兩顆按鈕，
 * 而登入時「雲端還沒有這個暱稱的備份」那一問有三個答案（見 `ADR-0020`）：
 * 用這台的資料、清空重新開始、取消。硬拆成兩次 `confirm()` 的話，使用者會先被問
 * 一個沒頭沒尾的是非題，再被問第二個——三選一被拆成兩段就不再是三選一了。
 *
 * ## 樣式一個字都沒新增
 *
 * 沿用統計畫面那個彈窗的 `.modal-overlay` 一整套（`stats-view.ts` 是先例）。
 * 差別在那一個是拿來**看東西**的，常駐在畫面裡只換內容；這一個是拿來**選東西**的，
 * 問的時候才長出來，答完就整棵拆掉——它沒有「關著」的狀態要維持。
 *
 * ## 監聽器走成對註冊
 *
 * Esc 那一顆掛在 `document` 上，而這是元件層，因此照 `ADR-0011` 的下半條走：
 * 開著的那段時間才掛，答完就解除。這裡的解除時機是天然的——彈窗答完就不存在了，
 * 而 `settle()` 是唯一的出口，掛與解除因此都只寫在一處。
 */
import { el, button } from './dom';

/** 一顆按鈕。 */
export interface Choice<T> {
  label: string;
  /** 按下去回傳的答案。 */
  value: T;
  /** 這一顆會毀掉東西，畫成危險色。 */
  danger?: boolean;
}

export interface ChoiceModal<T> {
  title: string;
  body: string;
  /** 由上而下的按鈕。第一顆畫成主要動作。 */
  choices: readonly Choice<T>[];
  /**
   * 按 Esc 或點背景時的答案，也就是那顆「取消」的值。
   *
   * 必填而且刻意不給預設：這種彈窗一定有一個「什麼都不要發生」的答案，
   * 猜錯的代價是使用者按 Esc 想閃掉，結果替他做了決定。
   */
  dismiss: T;
}

/**
 * 問一句，等使用者按一顆。彈窗掛在 `document.body` 上，答完自己拆掉。
 */
export function askChoice<T>({ title, body, choices, dismiss }: ChoiceModal<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const buttons = choices.map((choice, index) =>
      button(
        choice.danger ? 'danger' : index === 0 ? 'primary' : 'secondary',
        choice.label,
        () => settle(choice.value),
      ),
    );

    const panel = el(
      'div',
      'modal-panel',
      el('div', 'modal-header', el('span', 'modal-title', title)),
      el('p', 'hint', body),
      el('div', 'modal-rows', ...buttons),
    );
    // 讀螢幕的人要知道自己被擋在一個問句前面，而不是畫面底下多了幾顆鈕。
    panel.role = 'dialog';
    panel.ariaModal = 'true';

    const overlay = el('div', 'modal-overlay', panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) settle(dismiss);
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') settle(dismiss);
    };

    /** 答案只算第一個。點背景的同一下若也命中按鈕，第二次呼叫就沒有效果。 */
    let done = false;
    function settle(answer: T): void {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(answer);
    }

    document.addEventListener('keydown', onKeyDown);
    document.body.append(overlay);
    // 焦點落在「取消」，不是第一顆。這種彈窗至少有一個選項會毀掉東西，
    // 而使用者習慣性按下 Enter 時，預設答案應該是那個什麼都不會發生的。
    buttons[choices.findIndex((choice) => choice.value === dismiss)]?.focus();
  });
}
