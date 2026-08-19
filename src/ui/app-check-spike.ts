/**
 * 探路：在真 iPhone 上證明「App Attest → App Check → Firebase AI Logic」這條路走得通。
 *
 * **這整支檔案是丟棄品。** 票 02 動工前連同 `data-view.ts` 那三行接線一起刪掉，
 * 見 `.scratch/fixed-gemini-key/issues/01`。以下幾個平常不會這樣寫的地方都是這個理由：
 *
 * - 畫面與網路兩件事寫在同一支檔案裡（平常是 `lib/` 做事、`ui/` 畫畫面）。
 * - **Capacitor 的東西出現在 `ui/`。** `haptics-native.ts`、`speech-native.ts` 那幾支的
 *   檔頭都明寫「所有 Capacitor 的東西只出現在這裡」，那條慣例是為了讓 `lib/` 的其餘部分
 *   在 vitest 裡測得動。這支檔案不寫測試（原生外掛在 node 環境下不存在，硬要測就得造一整套
 *   假物件），也馬上要刪，因此不值得為它多開一支 `lib/app-check-native.ts`。
 *   票 02 做真的那一版時要照既有慣例分層。
 * - 文字寫死在程式碼裡，不進 `i18n/`。這顆按鈕只有維護者自己會按，
 *   為它開三個語言的翻譯鍵，刪的時候還要記得回去清。
 * - `<pre>` 的樣式用行內寫，不進 `styles.css`。動了那個檔，網頁版的 CSS 產物
 *   就跟著變，本票「網頁版行為零改動」那條驗收會被自己弄髒。
 *
 * 只有 iOS build 會載入這支檔案：`data-view.ts` 那邊用 `import.meta.env.MODE === 'ios'`
 * 包住一個動態 import，網頁版打包時整段是死碼，firebase 一個位元組都不會進去
 * （spec 決定十六：兩條路徑在打包時切，不在執行期切）。
 */
import { FirebaseApp as NativeFirebaseApp } from '@capacitor-firebase/app';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { el, button } from './dom';

/** 與 `gemini-reading.ts` 同一個模型，這張票不趁機換（spec 決定十四）。 */
const MODEL = 'gemini-3.6-flash';

/** 探路用的詞條。挑一個拆得開的，回覆長度剛好塞得進一個手機畫面。 */
const TERM = '吹雪';

/**
 * 把 `gemini-reading.ts` 的 `RESPONSE_SCHEMA` 用 `Schema.*` 建構式重寫一次。
 * 這張票要回報的發現之一就是「形狀保不保得住」，所以刻意逐項對齊而不簡化：
 *
 * - 陣列包物件、物件包陣列：`Schema.array({ items })` 疊得起來。
 * - `required`：Firebase 這邊反過來記，所有屬性預設必填，可選的才列進
 *   `optionalProperties`。原本兩處 `required` 列的都是全部屬性，因此這裡兩處都不必寫。
 * - `propertyOrdering`：原樣支援，`splittable` 排在 `cells` 前面那個用意保得住。
 */
const RESPONSE_SCHEMA = Schema.array({
  items: Schema.object({
    properties: {
      splittable: Schema.boolean(),
      cells: Schema.array({
        items: Schema.object({
          properties: {
            kanji: Schema.string(),
            reading: Schema.string(),
          },
          propertyOrdering: ['kanji', 'reading'],
        }),
      }),
    },
    propertyOrdering: ['splittable', 'cells'],
  }),
});

/** 一行日誌。丟到畫面上的 `<pre>` 裡，維護者在手機上讀的就是這個。 */
type Log = (line: string) => void;

/** 錯誤在這裡就攤平成字串——手機上看不到主控台，訊息丟了就等於這一趟白跑。 */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * JS SDK 那份設定值跟原生要，不在 repo 裡另抄一份。
 *
 * 這麼做還順手回答了一個問題：App Check 權杖是綁在 Firebase 的 App ID 上的，
 * 而原生層拿到的權杖屬於 `GoogleService-Info.plist` 裡那支 **iOS** app。
 * 從同一個來源取設定，JS SDK 用的就必然是同一個 App ID，不會對不上。
 */
async function nativeOptions(log: Log): Promise<FirebaseOptions> {
  const options = await NativeFirebaseApp.getOptions();
  log(`原生設定：projectId=${options.projectId} appId=${options.applicationId}`);
  return {
    apiKey: options.apiKey,
    appId: options.applicationId,
    projectId: options.projectId,
    messagingSenderId: options.gcmSenderId,
    storageBucket: options.storageBucket,
    databaseURL: options.databaseUrl,
  };
}

/** 問一次讀音。兩條路徑（帶權杖與不帶）共用，差別只在傳進來的 app 實例掛沒掛 App Check。 */
async function ask(app: FirebaseApp, log: Log): Promise<void> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const result = await model.generateContent(`標出「${TERM}」裡每一串漢字的讀音。`);
  log(`回覆：${result.response.text()}`);
}

/**
 * 外掛與 JS SDK 之間差一個型別，這支函式補上。
 *
 * 外掛的 `expireTimeMillis` 是可選的（它的註解寫「只有 Android 與 iOS 有」），
 * 而 `CustomProvider` 要的 `AppCheckToken` 那一格必填。README 上那段
 * `getToken: () => FirebaseAppCheck.getToken()` 因此在嚴格模式下編不過。
 * iOS 原生實作實際上一定會帶值回來，補一個 0 只是為了讓型別對得上；
 * 真的收到 0 的話 SDK 會當它已過期、每次重拿，行為仍然正確。
 */
async function appCheckToken(): Promise<{ token: string; expireTimeMillis: number }> {
  const { token, expireTimeMillis } = await FirebaseAppCheck.getToken();
  return { token, expireTimeMillis: expireTimeMillis ?? 0 };
}

/**
 * A：正常那條路。原生跟 Apple 要 App Attest 憑證換成 App Check 權杖，
 * 交給 JS SDK 的 `CustomProvider`，再帶著它打 Firebase AI Logic。
 */
async function withAppCheck(log: Log): Promise<void> {
  const options = await nativeOptions(log);

  await FirebaseAppCheck.initialize();
  log('原生 App Check 初始化完成');

  // 先單獨要一次權杖再交給 JS SDK。這一步失敗的話，是 Apple 或 Firebase 後台的問題，
  // 跟 AI Logic 無關——分開叫才分得出來是哪一段倒的。
  const { token, expireTimeMillis } = await appCheckToken();
  log(`拿到權杖：長度 ${token.length}，開頭 ${token.slice(0, 12)}…`);
  log(`到期：${new Date(expireTimeMillis).toISOString()}`);

  const app = initializeApp(options, 'spike-attested');
  await initializeAppCheck(app, { provider: new CustomProvider({ getToken: appCheckToken }) });
  log('JS SDK 的 App Check 掛上了');

  await ask(app, log);
}

/**
 * B：對照組。同一個專案、同一個模型，但這個 app 實例沒有掛 App Check。
 *
 * 存在的理由很實際：一輪 TestFlight 要等很久。A 成功只證明「帶著權杖打得通」，
 * 證不出「不帶就會被擋」——後者才是 App Check 在保護的東西。兩顆按鈕排在一起，
 * 在 Firebase 主控台把強制執行打開之後各按一次，一次往返就兩件事都驗完。
 */
async function withoutAppCheck(log: Log): Promise<void> {
  const options = await nativeOptions(log);
  log('這一顆刻意不掛 App Check');
  await ask(initializeApp(options, 'spike-bare'), log);
}

/**
 * 探路面板。`data-view.ts` 只在 iOS build 上把它接進資料畫面最底下。
 */
export function spikePanel(): HTMLElement {
  const output = el('pre');
  output.style.whiteSpace = 'pre-wrap';
  output.style.wordBreak = 'break-all';
  output.style.fontSize = '0.75rem';
  output.style.maxHeight = '18rem';
  output.style.overflowY = 'auto';

  const run = (label: string, task: (log: Log) => Promise<void>) =>
    button('secondary', label, () => {
      output.textContent = `${label}…\n`;
      const log: Log = (line) => {
        output.textContent += `${line}\n`;
      };
      // 成敗兩種結果都印在同一個地方。失敗的訊息比成功的還有價值——
      // 這張票要回報的就是哪一段倒了、倒在什麼話上。
      task(log).then(
        () => log('—— 完成'),
        (error: unknown) => log(`—— 失敗：${describe(error)}`),
      );
    });

  const section = el('section', 'section');
  section.append(
    el('h2', 'section-title', 'App Attest 探路'),
    el('p', 'hint', '票 01 用的暫時按鈕，驗完就拆。A 帶 App Check 權杖，B 刻意不帶。'),
    el(
      'div',
      'data-actions',
      run('A：帶權杖', withAppCheck),
      run('B：不帶權杖', withoutAppCheck),
    ),
    output,
  );
  return section;
}
