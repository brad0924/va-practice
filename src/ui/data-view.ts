import type { App } from '../app';
import { toDateKey } from '../lib/review';
import { toMessage } from '../lib/storage';
import { el, button } from './dom';

const CLOUD_HINT =
  '輸入自取的暱稱與密碼，進度就會自動備份到雲端；換裝置輸入同一組就接得回來。' +
  '密碼同時用來加密內容，沒有人能幫你重設，遺失後雲端那份就再也讀不出來。';

export function dataView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '卡片', () => app.showList()),
    el('span', 'bar-title', '資料'),
  );

  const main = el('main', 'panel');
  main.append(cloudSection(app), fileSection(app));

  screen.append(header, main);
  return screen;
}

/** 雲端備份：未登入時是一組暱稱密碼欄位，登入後只剩一行說明。 */
function cloudSection(app: App): HTMLElement {
  const section = el('section', 'section');
  section.append(el('h2', 'section-title', '雲端備份'));

  const signedInAs = app.cloud.nickname();
  if (signedInAs !== null) {
    section.append(
      el('p', 'hint', `已登入：${signedInAs}。複習進度會自動備份，換裝置輸入同一組暱稱與密碼就接得回來。`),
    );
    return section;
  }

  const nickname = el('input', 'field');
  nickname.type = 'text';
  nickname.autocapitalize = 'off';
  nickname.spellcheck = false;
  nickname.autocomplete = 'username';

  const password = el('input', 'field');
  password.type = 'password';
  password.autocomplete = 'current-password';

  const error = el('p', 'error');

  const submit = el('button', 'primary', '登入');
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(
    el('p', 'hint', CLOUD_HINT),
    labelled('暱稱', nickname),
    labelled('密碼', password),
    error,
    el('div', 'form-actions', submit),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = '連線中…';
    void app.cloud
      .signIn(nickname.value, password.value, app.data)
      // 重畫成已登入的樣子。拉到雲端資料的情形下這裡是第二次重畫，內容相同。
      .then(() => app.showData())
      .catch((reason: unknown) => {
        error.textContent = toMessage(reason);
        submit.disabled = false;
        submit.textContent = '登入';
      });
  });

  section.append(form);
  return section;
}

/** 手動備份：雲端再穩定也可能出事，匯出的 JSON 是不依賴任何人的後路。 */
function fileSection(app: App): HTMLElement {
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
      // 匯入也是一次本機資料變動。不推上去的話，下次開 app 會被雲端那份蓋回去。
      app.cloud.push(app.data);
      // 匯入成功不另外報喜，直接跳回卡片頁——新資料出現在眼前就是回饋。
      app.showList();
    } catch (error) {
      status.textContent = `匯入失敗：${toMessage(error)}`;
      status.classList.add('error');
    }
  });

  const section = el('section', 'section');
  section.append(
    el('h2', 'section-title', '手動備份'),
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
  return section;
}

function labelled(text: string, control: HTMLInputElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
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
