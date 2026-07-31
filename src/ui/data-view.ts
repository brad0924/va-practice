import type { App } from '../app';
import { toDateKey } from '../lib/review';
import { toMessage } from '../lib/storage';
import { el, button, download } from './dom';

const CLOUD_HINT =
  '輸入自取的暱稱與密碼，進度就會自動備份到雲端；換裝置輸入同一組就接得回來。' +
  '密碼同時用來加密內容，沒有人能幫你重設，遺失後雲端那份就再也讀不出來。';

/**
 * 換密碼的後果是機制決定的，不是可以藏起來的細節：密碼同時是雲端的指紋與金鑰，
 * 換掉之後舊密碼既推不上去也解不開（見 spec 決定 9）。因此這段文字常駐在表單裡。
 */
const CHANGE_HINT = '換密碼後，其他還在用舊密碼的裝置會被擋下來，需要各自重新輸入新密碼才能繼續同步。';

const STOP_CONFIRM = '停止後不再備份到雲端，卡片與進度會完整留在這台裝置。確定要停止？';

/**
 * 「不要開計費」是這個設計唯一的保險：金鑰只存在本機、不上雲也不進匯出檔，
 * 但真的外洩時，沒綁卡的金鑰代價只是免費額度被別人用掉，不會生出帳單。
 * 因此這句話與取得方式一起常駐在表單裡（見 issue 01 決定 7）。
 */
const GEMINI_HINT =
  '到 Google AI Studio（aistudio.google.com/apikey）建立金鑰，' +
  '並確認該專案沒有啟用計費——一旦啟用，免費額度就會消失，之後每次呼叫都從第一個字開始計費。' +
  '金鑰只留在這台裝置，不會上傳雲端，也不會出現在匯出的備份檔裡。';

export function dataView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '卡片', () => app.showList()),
    el('span', 'bar-title', '資料'),
    button('bar-action', '統計', () => app.showStats()),
  );

  const main = el('main', 'panel');
  main.append(cloudSection(app), geminiSection(app), fileSection(app));

  screen.append(header, main);
  return screen;
}

/** 雲端備份：未登入時是一組暱稱密碼欄位，登入後是換密碼與停止同步兩個控制項。 */
function cloudSection(app: App): HTMLElement {
  const section = el('section', 'section');
  section.append(el('h2', 'section-title', '雲端備份'));

  const signedInAs = app.cloud.nickname();
  if (signedInAs !== null) {
    section.append(
      el('p', 'hint', `已登入：${signedInAs}。複習進度會自動備份，換裝置輸入同一組暱稱與密碼就接得回來。`),
      el('h3', 'subsection-title', '換密碼'),
      changePasswordForm(app),
      button('danger', '停止同步', () => {
        if (!confirm(STOP_CONFIRM)) return;
        app.cloud.signOut();
        // 重畫成未登入的樣子，暱稱密碼欄位跟著回來。
        app.showData();
      }),
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

/**
 * 換密碼。成功後不重畫整個畫面——畫面上其他東西都沒變，
 * 就地清空欄位並留一句成功訊息，使用者才看得到「換掉了」這件事。
 */
function changePasswordForm(app: App): HTMLElement {
  const password = el('input', 'field');
  password.type = 'password';
  password.autocomplete = 'new-password';

  const error = el('p', 'error');
  const status = el('p', 'status');

  const submit = el('button', 'primary', '更新密碼');
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(
    labelled('新密碼', password),
    el('p', 'hint', CHANGE_HINT),
    error,
    status,
    el('div', 'form-actions', submit),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    status.textContent = '';
    submit.disabled = true;
    submit.textContent = '連線中…';
    void app.cloud
      .changePassword(password.value, app.data)
      .then(() => {
        password.value = '';
        status.textContent = '密碼已更新。其他裝置要重新輸入新密碼才能繼續同步。';
      })
      .catch((reason: unknown) => {
        error.textContent = toMessage(reason);
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = '更新密碼';
      });
  });

  return form;
}

/**
 * Gemini 金鑰。已設定時畫面上只剩一行狀態字與清除鍵——連輸入框都收起來，
 * 已存的金鑰因此沒有任何回顯的機會；要換金鑰就清掉再貼一次（見 issue 01 決定 6）。
 * 這也與上面的雲端備份區塊同形：設定完成後表單換成控制項。
 */
function geminiSection(app: App): HTMLElement {
  const section = el('section', 'section');
  section.append(el('h2', 'section-title', 'Gemini API 金鑰'));

  if (app.gemini.read() !== null) {
    section.append(
      el('p', 'hint', '已設定。要換一把金鑰的話，先按清除再貼上新的。'),
      button('danger', '清除金鑰', () => {
        app.gemini.write(null);
        // 重畫成未設定的樣子，輸入框跟著回來。
        app.showData();
      }),
    );
    return section;
  }

  const key = el('input', 'field');
  key.type = 'password';
  key.autocapitalize = 'off';
  key.spellcheck = false;
  key.autocomplete = 'off';

  const submit = el('button', 'primary', '儲存金鑰');
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(el('p', 'hint', GEMINI_HINT), labelled('金鑰', key), el('div', 'form-actions', submit));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // 空的輸入框沒有東西可存，按了就當沒按——不必重畫。
    if (key.value.trim() === '') return;
    app.gemini.write(key.value);
    // 重畫成已設定的樣子：輸入框收起來，清除鍵出現。
    app.showData();
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
      app.importBackup(await chosen.text());
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
      button('secondary', '匯出備份', () =>
        download(app.exportBackup(), `jlpt-cards-${toDateKey(app.now())}.json`, 'application/json'),
      ),
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
