/**
 * iOS 上的讀音預填：固定金鑰、走 Firebase AI Logic，使用者什麼都不必設定。
 *
 * 與網頁版分岔的只有「請求怎麼送出去」這一段（spec 決定十六）。提示詞、回覆的形狀、
 * 逾時的秒數、以及回來之後那道 `acceptPrefill` 的驗證，全部沿用 `gemini-reading.ts`
 * 那一份——模型看到的字兩邊一模一樣，差別只在誰把它交出去。
 *
 * 金鑰不在這裡，也不在 app 裡的任何地方。請求先到 Google 的 Firebase AI Logic，
 * 金鑰在那台機器上才加進去；能不能用那台機器由 App Check 決定，而 App Check 收的是
 * 原生層跟 Apple 要來的 App Attest 憑證（票 01 已在真機上驗過整條）。
 *
 * **本模組不寫自動測試**，立場與 `haptics-native.ts`、`speech-native.ts` 相同：原生外掛
 * 在 node 環境下不存在，硬要測就得造一整套假物件，測到的只是自己寫的假貨。真正值得守的
 * 「各種失敗變成一條說得出原因的 key」抽在 `ai-logic-error.ts`，那一支測得到。
 *
 * 只有 iOS build 會載入這支檔案：`editor-view.ts` 用 `import.meta.env.MODE === 'ios'`
 * 包住一個動態 import，網頁版打包時整段是死碼，firebase 一個位元組都不會進去。
 */
import { FirebaseApp as NativeFirebaseApp } from '@capacitor-firebase/app';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel } from 'firebase/ai';
import { initializeApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';

import { AppError, SilentError } from './app-error';
import { toReadingError } from './ai-logic-error';
import { MODEL, RESPONSE_SCHEMA, TIMEOUT_MS, parseReply, promptFor } from './gemini-reading';

/**
 * 外掛與 JS SDK 之間差一個型別，這支函式補上。
 *
 * 外掛的 `expireTimeMillis` 是可選的（它的註解寫「只有 Android 與 iOS 有」），而
 * `CustomProvider` 要的那一格必填，README 上那段一行寫法因此在嚴格模式下編不過。
 * iOS 原生實作實際上一定會帶值回來，補一個 0 只是為了讓型別對得上；真的收到 0 的話
 * SDK 會當它已過期、每次重拿，行為仍然正確。
 */
async function appCheckToken(): Promise<{ token: string; expireTimeMillis: number }> {
  const { token, expireTimeMillis } = await FirebaseAppCheck.getToken();
  return { token, expireTimeMillis: expireTimeMillis ?? 0 };
}

/**
 * 接線：把原生那一端的設定與憑證接到 JS SDK 上，交出一台可以問話的模型。
 *
 * 設定值跟原生要，不在 repo 裡另抄一份。這麼做順手回答了一個問題：App Check 權杖是綁在
 * Firebase 的 App ID 上的，而原生層拿到的權杖屬於 `GoogleService-Info.plist` 裡那支 iOS
 * app。從同一個來源取設定，JS SDK 用的就必然是同一個 App ID，不會對不上。
 *
 * 這一段完全不上網，離線也接得起來——憑證是 SDK 稍後要送請求時才去拿的。
 */
async function wire(): Promise<GenerativeModel> {
  const options = await NativeFirebaseApp.getOptions();

  // 原生那一側的 App Check。真正指定 App Attest 的地方在 `AppDelegate.swift`，
  // 必須搶在 Firebase 啟動之前——票 01 花了一輪 TestFlight 才證實這個順序。
  await FirebaseAppCheck.initialize();

  const app = initializeApp(
    {
      apiKey: options.apiKey,
      appId: options.applicationId,
      projectId: options.projectId,
      messagingSenderId: options.gcmSenderId,
      storageBucket: options.storageBucket,
      databaseURL: options.databaseUrl,
    },
    'reading-prefill',
  );
  await initializeAppCheck(app, { provider: new CustomProvider({ getToken: appCheckToken }) });

  // 後端明寫出來讓決定看得見：`getAI()` 的預設本來就是 Gemini Developer API，不是 Vertex。
  // 逾時掛在這裡，管的是送出去到收回來那一段；跟 Apple 要憑證那一段不在它的預算裡，
  // 所以 `prepare()` 要提早把憑證暖好。
  return getGenerativeModel(
    getAI(app, { backend: new GoogleAIBackend() }),
    {
      model: MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    },
    { timeout: TIMEOUT_MS },
  );
}

/**
 * 接一次就好，但**失敗的那一次不要記住**。
 *
 * `getOptions()` 與 `initialize()` 都是往原生層的橋接呼叫，失敗不一定是永久的。
 * 記住一顆被拒絕的 promise 等於讓這次開 app 期間的讀音預填死在第一次失敗上，
 * 而且那個死法是靜默的——畫面上一個字都不出，誰都不會發現。忘掉它，下一張卡再試一次。
 *
 * 重試是安全的：`initializeApp()` 同名同設定回的是既有那一個；`initializeAppCheck()`
 * 比對 `getToken` 的內容認得出是同一支，也回既有那一個。兩者都不會丟重複初始化的錯。
 */
let wired: Promise<GenerativeModel> | null = null;
function ensure(): Promise<GenerativeModel> {
  wired ??= wire().catch((error: unknown) => {
    wired = null;
    throw error;
  });
  return wired;
}

/**
 * 先去排隊拿憑證，不等它。編輯畫面一打開就叫這支。
 *
 * App Attest 第一次跟 Apple 要憑證要花好幾秒。等到使用者打完詞條才開始排，那幾秒會
 * 整段吃掉問話的預算，第一張卡就可能白等一場。趁他還在打字的時候先排完，之後每一次
 * 都是從快取拿。失敗吞掉：這裡本來就沒有任何話要說，真的沒拿到的話 `askReadingNative()`
 * 會再走一次同一條路。
 */
export function prepare(): void {
  void ensure()
    .then(appCheckToken)
    .catch(() => {});
}

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出帶 key 的錯，與網頁版同一組語彙；唯一的例外是 App Check 那一種，
 * 拋出的是 `SilentError`，讀音編輯器接到它就整個不出聲（spec 決定十一）。
 */
export async function askReadingNative(term: string): Promise<unknown> {
  // 接線失敗（外掛沒進去、plist 沒被打包）使用者一點辦法都沒有，一個字都不必說。
  const model = await ensure().catch(() => {
    throw new SilentError();
  });

  // 憑證自己一份預算，與問模型那一份分開。要不到、或要太久，一律靜默。
  await budgeted(appCheckToken()).catch(() => {
    throw new SilentError();
  });

  let text: string;
  try {
    const result = await model.generateContent(promptFor(term));
    text = result.response.text();
  } catch (error) {
    // 憑證明明剛拿到卻還是被退，那是 Google 那端不認這張票，換回來的是 401。
    // 那條路因此也在這裡收斂——`toReadingError()` 認得 401 就是 App Check 沒過。
    // 2026-08-20 在真機上驗過：畫面上一個字都沒有，小框裡是 status 401。
    throw toReadingError(error);
  }
  // 沒有候選回覆時 `text()` 回空字串而不是丟錯，與網頁版挖不到那一格是同一件事。
  if (text === '') throw new AppError('gemini.emptyReply');

  return parseReply(text);
}

/**
 * 給憑證那一段自己的碼表。
 *
 * 非做不可的理由寫在 SDK 的原始碼裡：`makeRequest()` 是**先按下碼表、再去要 App Check
 * 權杖**（`headers: await getHeaders(url)` 那一行才去要）。也就是說要憑證與問模型共吃
 * 同一份 10 秒。憑證慢一點，使用者就會看到「等超過 10 秒沒有回覆」——而那句話是講給
 * 「模型太慢」聽的，不是講給 App Check 聽的。App Check 的麻煩使用者一點辦法都沒有，
 * 該做的是閉嘴（spec 決定十一）。
 *
 * 這裡先把憑證要到手，SDK 稍後在自己的窗口裡再要一次時就是從快取拿，不再吃掉模型的預算。
 *
 * 逾時不取消底下那件事——原生層那一趟繼續跑完，順便把快取暖起來，下一張卡就快了。
 * 秒數沿用同一個常數：現在還沒有真機量到的數字，等探針回報再決定要不要分開。
 */
function budgeted<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SilentError()), TIMEOUT_MS);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}
