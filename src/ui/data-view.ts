import type { App } from '../app';
import { APP_NAME } from '../lib/app-name';
import { toDateKey } from '../lib/review';
import { toMessage } from '../lib/storage';
import { el, button, download } from './dom';
import { booksSection } from './books-section';

/**
 * 最後一句不是客套話：密碼同時是加密金鑰，遺失即無法復原是機制決定的（見 ADR-0003）。
 * iOS 上把密碼交給 iCloud 鑰匙圈保管降低了忘記的機率，但沒有消除它——使用者可能沒開
 * 鑰匙圈，或整個換掉 Apple ID。因此這裡必須同時指出唯一不依賴密碼的後路（見 spec 決定十三）。
 */
const CLOUD_HINT =
  '輸入自取的暱稱與密碼，進度就會自動備份到雲端；換裝置輸入同一組就接得回來。' +
  '密碼同時用來加密內容，沒有人能幫你重設，遺失後雲端那份就再也讀不出來。' +
  '請用下面的「手動備份」另外匯出一份檔案，那是唯一不需要密碼就打得開的後路。';

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

/** 三件事講清楚：什麼時候會叫、什麼時候不叫、以及這個開關只管這一台。 */
const REMINDER_HINT =
  '有卡到期的日子才會叫你，一張都沒有就不吵；當天複習完之後，那天剩下的提醒也不會再出現。' +
  '這個開關只影響這台裝置，不會上傳雲端，也不會出現在匯出的備份檔裡。';

/**
 * 權限被拒絕時說實話：不假裝提醒有在運作，也不再問第二次——系統本來就不會再跳，
 * 唯一能改的地方是設定 app，因此直接指過去（見 spec 決定二十四）。
 */
// 這裡引用的是 iOS 設定 app 裡的項目名，也就是主畫面圖示底下那行字（短名）。
const REMINDER_DENIED = `通知權限是關的，提醒送不出來。請到「設定 → ${APP_NAME.short} → 通知」允許通知後，再回來打開這個開關。`;

export function dataView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', '卡片', () => app.showList()),
    el('span', 'bar-title', '資料'),
    button('bar-action', '統計', () => app.showStats()),
  );

  const main = el('main', 'panel');
  // 單字本擺最上面：它是這一頁的主角，其餘幾區都是設定好就很久不再碰的東西。
  // 提醒緊接在 Gemini 金鑰之後：兩者同樣是「只管這一台裝置」的偏好，擺在一起。
  main.append(booksSection(app), cloudSection(app), geminiSection(app));
  const reminder = reminderSection(app);
  if (reminder) main.append(reminder);
  main.append(fileSection(app));

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

/**
 * 每日提醒的開關。**只有原生殼裡才長出這一區**——網頁版 `app.reminder` 為 null，
 * 這裡直接回 null，「資料」畫面上一個字都不會多。
 *
 * 開起來要先過通知權限那一關，因此不像其他幾區按了就重畫：就地把勾回彈、
 * 把原因寫在底下，使用者才看得懂剛剛發生了什麼事。
 */
function reminderSection(app: App): HTMLElement | null {
  const reminder = app.reminder;
  if (reminder === null) return null;

  const check = el('input', 'toggle-check');
  check.type = 'checkbox';
  check.checked = reminder.enabled();

  // 原生的時間欄位：iOS 上叫出來的是系統那個滾輪，長得跟其他 app 裡的一樣，
  // 也自動跟著系統的 12／24 小時制走。自己做一個只會比它差（見票 18）。
  const time = el('input', 'field time');
  time.type = 'time';
  time.value = reminder.time();

  // 「提醒時間」與時間格是開關那句話的後半，讀起來是一句：
  // 「每天提醒我，提醒時間 08:00」。刻意不塞進開關那個 <label> 裡——
  // 塞進去的話點時間格會順手把開關關掉。
  const timeRow = el('label', 'reminder-time', el('span', 'toggle-label', '提醒時間'), time);

  /**
   * 時間欄位跟著開關走：關著的時候那一格沒有意義，長在那裡只會讓人以為關著也會叫
   * （見票 18）。四條路（初次畫、關掉、開起來、被拒絕）都呼叫這一支而不是各自
   * 設一次——漏掉其中一條就會出現「關著卻看得到時間欄位」。
   */
  function syncTimeRow(): void {
    timeRow.hidden = !check.checked;
  }

  syncTimeRow();

  const status = el('p', 'status');

  function deny(): void {
    check.checked = false;
    syncTimeRow();
    status.textContent = REMINDER_DENIED;
    status.classList.add('error');
  }

  // 先照記著的狀態畫，再去問通知權限還在不在——使用者可能剛從系統設定把它關掉，
  // 而一個亮著卻收不到提醒的開關正是決定二十四禁止的假象。
  if (check.checked) {
    void reminder.verify().then((live) => {
      if (!live) deny();
    });
  }

  check.addEventListener('change', () => {
    status.textContent = '';
    status.classList.remove('error');
    if (!check.checked) {
      syncTimeRow();
      reminder.disable();
      return;
    }

    // 系統對話框跳出來的期間先鎖住，免得連點兩下變成兩次請求。
    check.disabled = true;
    void reminder.enable().then((granted) => {
      check.disabled = false;
      // 被拒絕時勾自己彈回去：使用者寧可看到「你關掉了通知權限」，
      // 也不要以為提醒在運作卻永遠收不到。
      if (!granted) {
        deny();
        return;
      }
      syncTimeRow();
    });
  });

  time.addEventListener('change', () => {
    // 時間欄位是可以被清空的（值變成空字串）。那不是一個時刻，不能存進去——
    // 把記著的那個填回去，畫面與存的東西才不會各說各話。
    if (time.value === '') {
      time.value = reminder.time();
      return;
    }
    reminder.setTime(time.value);
  });

  const section = el('section', 'section');
  section.append(
    el('h2', 'section-title', '每日提醒'),
    // 兩塊並排成一句話。逗號留在開關那半，換行時斷在它後面才讀得順。
    el(
      'div',
      'reminder-line',
      el('label', 'toggle', check, el('span', 'toggle-label', '每天提醒我，')),
      timeRow,
    ),
    el('p', 'hint', REMINDER_HINT),
    status,
  );
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
      button('secondary', '匯出備份', async () => {
        try {
          await download(
            app.exportBackup(),
            `jlpt-cards-${toDateKey(app.now())}.json`,
            'application/json',
          );
        } catch (error) {
          // 只有原生那條路（iOS 的分享單）丟得出東西來，網頁版走不到這裡。
          status.textContent = `匯出失敗：${toMessage(error)}`;
          status.classList.add('error');
        }
      }),
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
