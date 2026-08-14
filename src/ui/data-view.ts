import type { App } from '../app';
import { lang, t, type LangChoice } from '../i18n';
import { APP_NAME } from '../lib/app-name';
import { toMessage } from '../lib/app-error';
import { toDateKey } from '../lib/review';
import { el, button, download } from './dom';
import { booksSection } from './books-section';

/**
 * 這一頁七段常駐的說明文字都搬進翻譯檔了，各自為什麼非講不可仍記在這裡：
 *
 * - `data.langHint`：語言的選擇與提醒開關是同一類東西——只留在這台裝置，不進雲端也不進
 *   備份檔（見 spec 決定五）。措辭刻意照抄底下 `data.reminderHint` 的後半句，同一件事
 *   不要有兩種講法。
 * - `data.cloudHint`：最後一句不是客套話。密碼同時是加密金鑰，遺失即無法復原是機制
 *   決定的（見 ADR-0003）。iOS 上把密碼交給 iCloud 鑰匙圈保管降低了忘記的機率，但
 *   沒有消除它——使用者可能沒開鑰匙圈，或整個換掉 Apple ID。因此必須同時指出唯一
 *   不依賴密碼的後路（見 spec 決定十三）。
 * - `data.changeHint`：換密碼的後果是機制決定的，不是可以藏起來的細節——密碼同時是
 *   雲端的指紋與金鑰，換掉之後舊密碼既推不上去也解不開（見 spec 決定 9）。
 * - `data.geminiHint`：「不要開計費」是這個設計唯一的保險。金鑰只存在本機、不上雲也
 *   不進匯出檔，但真的外洩時，沒綁卡的金鑰代價只是免費額度被別人用掉，不會生出帳單
 *   （見 issue 01 決定 7）。
 * - `data.reminderHint`：三件事講清楚——什麼時候會叫、什麼時候不叫、這個開關只管這一台。
 * - `data.reminderDenied`：權限被拒絕時說實話，不假裝提醒有在運作，也不再問第二次
 *   （見 spec 決定二十四）。`{app}` 代進去的是 iOS 設定 app 裡的項目名，也就是主畫面
 *   圖示底下那行字（短名）。
 *
 * 七段一律在畫的那一刻才查表。寫成模組層常數的話會在 `initI18n()` 之前就算完，
 * 而且切語言之後不會跟著換。
 */

export function dataView(app: App): HTMLElement {
  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    button('bar-action', t('nav.cards'), () => app.showList()),
    el('span', 'bar-title', t('nav.data')),
    button('bar-action', t('nav.stats'), () => app.showStats()),
  );

  const main = el('main', 'panel');
  // 單字本擺最上面：它是這一頁的主角，其餘幾區都是設定好就很久不再碰的東西。
  // 介面語言排在那幾區之首：語言是「app 用什麼話跟你說」，比底下四區都基礎，
  // 而看不懂畫面的人來找語言選單時，越上面越容易找到（spec 決定十）。
  // 提醒緊接在 Gemini 金鑰之後：兩者同樣是「只管這一台裝置」的偏好，擺在一起。
  main.append(booksSection(app), langSection(app), cloudSection(app), geminiSection(app));
  const reminder = reminderSection(app);
  if (reminder) main.append(reminder);
  main.append(fileSection(app));

  screen.append(header, main);
  return screen;
}

/**
 * 介面語言。整個 i18n 需求裡使用者唯一看得到的新東西。
 *
 * 用 `<select>` 而不是自製清單：`editor-view.ts` 的單字本選擇已經是同一種元件，
 * 而 iPhone 上它叫出來的是系統原生的選取介面，滑動與點擊的手感不必自己調
 * （spec 決定十）。
 *
 * 換完不必重開 app：`app.setLang()` 存好之後把當前畫面重畫一次，
 * 這一頁本來就是整片重畫的（票 02）。
 */
function langSection(app: App): HTMLElement {
  // 四個選項的文字**不隨介面語言變**，只有「系統預設」例外——它沒有自稱。
  // 理由很實際：萬一手滑切到看不懂的語言，滿畫面日文的時候「繁體中文」那四個字
  // 還認得出來，找得回來；用當前介面語言寫的話就變成一場猜謎（spec 決定十）。
  const choices: [LangChoice, string][] = [
    ['system', t('data.langSystem')],
    ['zh-Hant', '繁體中文'],
    ['en', 'English'],
    ['ja', '日本語'],
  ];

  const select = el('select', 'field');
  for (const [value, label] of choices) {
    const option = el('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = lang();

  // 值只可能是上面那四個之一：選單裡沒有別的東西，使用者也塞不進第五個。
  select.addEventListener('change', () => app.setLang(select.value as LangChoice));

  const section = el('section', 'section');
  section.append(
    el('h2', 'section-title', t('data.langTitle')),
    // 借 .form 的直排與間距，這一段不必另外一套版面（與 list-view.ts 的空狀態同一招）。
    el('div', 'form', select, el('p', 'hint', t('data.langHint'))),
  );
  return section;
}

/** 雲端備份：未登入時是一組暱稱密碼欄位，登入後是換密碼與停止同步兩個控制項。 */
function cloudSection(app: App): HTMLElement {
  const section = el('section', 'section');
  section.append(el('h2', 'section-title', t('data.cloudTitle')));

  const signedInAs = app.cloud.nickname();
  if (signedInAs !== null) {
    section.append(
      el('p', 'hint', t('data.signedInAs', { nickname: signedInAs })),
      el('h3', 'subsection-title', t('data.changePasswordTitle')),
      changePasswordForm(app),
      button('danger', t('data.stopSync'), () => {
        if (!confirm(t('data.stopConfirm'))) return;
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

  const submit = el('button', 'primary', t('data.signIn'));
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(
    el('p', 'hint', t('data.cloudHint')),
    labelled(t('data.nickname'), nickname),
    labelled(t('data.password'), password),
    error,
    el('div', 'form-actions', submit),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t('data.connecting');
    void app.cloud
      .signIn(nickname.value, password.value, app.data)
      // 重畫成已登入的樣子。拉到雲端資料的情形下這裡是第二次重畫，內容相同。
      .then(() => app.showData())
      .catch((reason: unknown) => {
        error.textContent = toMessage(reason);
        submit.disabled = false;
        submit.textContent = t('data.signIn');
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

  const submit = el('button', 'primary', t('data.updatePassword'));
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(
    labelled(t('data.newPassword'), password),
    el('p', 'hint', t('data.changeHint')),
    error,
    status,
    el('div', 'form-actions', submit),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    status.textContent = '';
    submit.disabled = true;
    submit.textContent = t('data.connecting');
    void app.cloud
      .changePassword(password.value, app.data)
      .then(() => {
        password.value = '';
        status.textContent = t('data.passwordUpdated');
      })
      .catch((reason: unknown) => {
        error.textContent = toMessage(reason);
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = t('data.updatePassword');
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
  section.append(el('h2', 'section-title', t('data.geminiTitle')));

  if (app.gemini.read() !== null) {
    section.append(
      el('p', 'hint', t('data.geminiSet')),
      button('danger', t('data.geminiClear'), () => {
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

  const submit = el('button', 'primary', t('data.geminiSave'));
  submit.type = 'submit';

  const form = el('form', 'form');
  form.append(
    el('p', 'hint', t('data.geminiHint')),
    labelled(t('data.geminiLabel'), key),
    el('div', 'form-actions', submit),
  );

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
  const timeRow = el('label', 'reminder-time', el('span', 'toggle-label', t('data.reminderTime')), time);

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
    status.textContent = t('data.reminderDenied', { app: APP_NAME.short });
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
    el('h2', 'section-title', t('data.reminderTitle')),
    // 兩塊並排成一句話。逗號留在開關那半，換行時斷在它後面才讀得順。
    el(
      'div',
      'reminder-line',
      el('label', 'toggle', check, el('span', 'toggle-label', t('data.reminderToggle'))),
      timeRow,
    ),
    el('p', 'hint', t('data.reminderHint')),
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
    if (!confirm(t('data.importConfirm'))) return;
    try {
      app.importBackup(await chosen.text());
      // 匯入成功不另外報喜，直接跳回卡片頁——新資料出現在眼前就是回饋。
      app.showList();
    } catch (error) {
      status.textContent = t('data.importFailed', { reason: toMessage(error) });
      status.classList.add('error');
    }
  });

  const section = el('section', 'section');
  section.append(
    el('h2', 'section-title', t('data.fileTitle')),
    el('p', 'hint', t('data.fileHint')),
    el(
      'div',
      'data-actions',
      button('secondary', t('data.exportButton'), async () => {
        try {
          await download(
            app.exportBackup(),
            `jlpt-cards-${toDateKey(app.now())}.json`,
            'application/json',
          );
        } catch (error) {
          // 只有原生那條路（iOS 的分享單）丟得出東西來，網頁版走不到這裡。
          status.textContent = t('data.exportFailed', { reason: toMessage(error) });
          status.classList.add('error');
        }
      }),
      button('secondary', t('data.importButton'), () => file.click()),
    ),
    file,
    status,
  );
  return section;
}

function labelled(text: string, control: HTMLInputElement): HTMLElement {
  return el('label', 'labelled', el('span', 'label-text', text), control);
}
