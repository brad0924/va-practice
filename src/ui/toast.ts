import { t } from '../i18n';
import { el, button } from './dom';

/** 自己消失前留在畫面上的時間。 */
const LINGER_MS = 3000;

export interface Toast {
  /** 掛進畫面的節點。沒話講時整個藏起來。 */
  readonly node: HTMLElement;
  show(message: string): void;
}

/**
 * 存完留在原地時的那一則回饋。
 *
 * 同時只有一則：連著存好幾張時是同一則被新內容取代，不疊成一整排蓋掉半個畫面。
 * 節點屬於掛它的那個畫面，畫面被換掉時一起卸下——計時器那時可能還在跑，
 * 但它動到的已經是離開文件的節點，藏不藏都不影響任何看得到的東西。
 */
export function createToast(): Toast {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const node = el('div', 'toast');
  node.setAttribute('role', 'status');
  node.hidden = true;

  const hide = () => {
    clearTimeout(timer);
    node.hidden = true;
  };

  const icon = el('span', 'toast-icon', '✓');
  const text = el('span', 'toast-text');
  const close = button('toast-close', '✕', hide);
  close.setAttribute('aria-label', t('toast.close'));
  node.append(icon, text, close);

  return {
    node,
    show(message) {
      // 先露臉再寫字：role="status" 要在節點看得見的時候換內容才報得出來。
      node.hidden = false;
      text.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(hide, LINGER_MS);
    },
  };
}
