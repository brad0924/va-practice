import type { App } from '../app';
import { toDateKey } from '../lib/review';
import { toMessage } from '../lib/storage';
import { el, button } from './dom';

export function dataView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '卡片', () => app.showList()),
    el('span', 'bar-title', '資料'),
  );

  const status = el('p', 'status');

  const file = el('input', 'file-input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    if (!confirm('匯入會整份覆蓋目前的卡片與進度，且無法復原。確定要繼續？')) return;
    try {
      app.store.importJson(await chosen.text());
      app.reload();
      // 匯入成功不另外報喜，直接跳回卡片頁——新資料出現在眼前就是回饋。
      app.showList();
    } catch (error) {
      status.textContent = `匯入失敗：${toMessage(error)}`;
      status.classList.add('error');
    }
  });

  const main = el('main', 'panel');
  main.append(
    el('p', 'hint', '匯出後可在另一台裝置匯入，用來備份或搬家。'),
    el(
      'div',
      'data-actions',
      button('secondary', '匯出備份', () => download(app)),
      button('secondary', '匯入備份', () => file.click()),
    ),
    file,
    status,
  );

  screen.append(header, main);
  return screen;
}

function download(app: App): void {
  const blob = new Blob([app.store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `jlpt-cards-${toDateKey(app.now())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
