import { el } from './dom';

/**
 * 雲端備份的那一行小狀態字。
 *
 * 掛在畫面之外、不歸任何一個畫面管——換畫面時整個內容會被換掉，
 * 掛在裡面的話狀態會跟著閃掉。平常完全不出現，只在推不上去時才露臉。
 */
export function createSyncStatus(host: HTMLElement): (message: string) => void {
  const node = el('p', 'sync-status');
  node.setAttribute('role', 'status');
  host.append(node);

  return (message) => {
    node.textContent = message;
  };
}
