/**
 * React Native 上的讀音預填：固定金鑰、走 Firebase AI Logic，使用者什麼都不必設定。
 *
 * **這是 `src/lib/gemini-reading-native.ts` 的第二份實作，不是抄一份新邏輯。**
 * 提示詞、回覆的形狀、逾時的秒數、重試的規矩、回來之後那道 `acceptPrefill` 的驗證，
 * 全部沿用 `core/` 那一份——模型看到的字三條路一模一樣（spec 決定十六），
 * 差別只在「誰把它交出去」。這支檔只負責那一段。
 *
 * ## 與 Capacitor 版那一支差在哪
 *
 * Capacitor 版是「JS SDK ＋ 一個把原生權杖橋接過去的 `CustomProvider`」：那邊的
 * `firebase/app-check` 是網頁版的實作，拿不到 App Attest，只好自己去問外掛再交回去。
 * **這裡整條在原生層**，因此少掉三段接線：
 *
 * - **不必 `initializeApp()`。** `@react-native-firebase/app` 開機時就照
 *   `GoogleService-Info.plist` 把預設 app 建好了，`getApp()` 直接拿得到。
 * - **不必自己橋接 App Check 權杖。** `initializeAppCheck()` 回的那個物件遞給
 *   `getAI()`，SDK 每次請求自己去拿（`ai/lib/models/utils.ts` 的 `getAppCheckToken`）。
 * - **不必寫一行 Swift。** Capacitor 版要在 `AppDelegate.swift` 裡搶在 Firebase 啟動前
 *   `setAppCheckProviderFactory`，否則會走成 DeviceCheck（`.scratch/fixed-gemini-key/issues/01`
 *   花了一輪 TestFlight 才查出來）。這裡用 `provider.configure({ apple: { provider: 'appAttest' } })`
 *   明講，套件自己在原生層照這個值裝 factory。**那個預設值仍然是 DeviceCheck，
 *   所以這一行不能省**——省了會撞到一模一樣的 `App not registered`。
 *
 * Firebase 主控台那一側完全沿用：同一個專案、同一支 iOS app（bundle ID
 * `io.github.brad0924.vapractice`，Expo 那邊寫的是同一個），App Check 已註冊為 App Attest
 * 並已強制執行。App Attest 的 entitlement 在 `../app.json` 的 `ios.entitlements`。
 *
 * **本模組不寫自動測試**，立場與 `./haptics.ts`、`./japanese-voice.ts` 相同：原生模組在
 * node 底下不存在，硬要測就得造一整套假物件，測到的只是自己寫的假貨。真正值得守的兩段
 * ——「各種失敗變成一條說得出原因的 key」與重試迴圈——抽在 `core/lib/ai-logic-error.ts`
 * 與 `core/lib/reading-retry.ts`，那兩支測得到。
 *
 * **模擬器上一定拿不到權杖。** `DCAppAttestService` 在模擬器上一律回不支援，因此讀音預填
 * 只在真機上驗得到；拿不到權杖那條路是靜默的（見底下 `SilentError`），畫面上一個字都不會出。
 */
import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
  type AppCheck,
} from '@react-native-firebase/app-check';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  type AI,
  type SchemaRequest,
} from '@react-native-firebase/ai';
import {
  activate,
  fetchAndActivate,
  getRemoteConfig,
  getString,
  type RemoteConfig,
} from '@react-native-firebase/remote-config';

import { AppError, SilentError } from '@core/lib/app-error';
import { toReadingError } from '@core/lib/ai-logic-error';
import {
  CONFIG_MAX_AGE_MS,
  REMOTE_FALLBACK,
  REMOTE_INSTRUCTIONS_KEY,
  REMOTE_MODEL_KEY,
  RESPONSE_SCHEMA,
  TIMEOUT_MS,
  parseReply,
  promptFor,
  remoteOrDefault,
} from '@core/lib/gemini-reading';
import { budgeted, withRetry } from '@core/lib/reading-retry';

/**
 * Remote Config 那兩個參數的名字、後備表與過期時間**住在 `core/lib/gemini-reading.ts`**。
 *
 * 兩條 Firebase 路徑（這一支與 Capacitor 版的 `src/lib/gemini-reading-native.ts`）背後是
 * 同一個 Firebase 專案的同兩個參數——維護者改一次主控台，兩支 app 一起跟上。各抄一份的話，
 * 改到一半漏掉一邊時沒有任何測試會紅，而症狀是「那支 app 安靜地一直用程式碼裡的舊值」，
 * 沒有人看得出來。spec 的〈程式碼怎麼擺〉把讀音預填點名為共用邏輯，就是在講這件事。
 *
 * 為什麼要有這條路（`.scratch/fixed-gemini-key/issues/03`）：固定金鑰把「模型被下架」的
 * 修復成本從幾分鐘拉到幾天。自備金鑰時那是零星使用者踩到、改個字串 push 上去；固定金鑰
 * 加 iOS 是所有人同時停擺，而使用者沒有自救途徑，維護者要重新打包送審、等一到兩天，
 * 還可能被退件。`ADR-0005` 記過一次真實事故（`gemini-2.5-flash` 對新金鑰回 404）。
 */

/** 這次要用的那個值。Remote Config 整個掛掉（`config` 是 null）也照樣答得出來。 */
function setting(config: RemoteConfig | null, key: keyof typeof REMOTE_FALLBACK): string {
  const fallback = REMOTE_FALLBACK[key];
  return config === null ? fallback : remoteOrDefault(getString(config, key), fallback);
}

/**
 * 接線一次就備齊的三樣東西：問話的入口、拿權杖的入口，與那份可以被遠端改掉的設定。
 *
 * `config` 允許是 null，這一格就是「它是保險，不是前置條件」寫成型別的樣子：
 * Remote Config 掛不起來時整條路照走，用的是程式碼裡那份後備值。
 */
interface Wiring {
  ai: AI;
  appCheck: AppCheck;
  config: RemoteConfig | null;
}

/**
 * 接線：指定 App Attest、把 App Check 掛到 AI 上、把 Remote Config 掛好。
 *
 * 這一段完全不上網，離線也接得起來——憑證是稍後真的要送請求時才去拿的，
 * 而 Remote Config 在這裡只是掛上去，真的去抓是 `refresh()` 的事。
 */
function wire(): Wiring {
  const app = getApp();

  // **這三行是這條路能不能走通的關鍵。** 套件在 iOS 上的出廠預設 provider 是 DeviceCheck，
  // 而主控台註冊的是 App Attest，兩邊對不上時 Google 回的是 `App not registered`。
  const provider = new ReactNativeFirebaseAppCheckProvider();
  // `appAttest` 而不是 `appAttestWithDeviceCheckFallback`：後者在 iOS 13 以下退回
  // DeviceCheck，而這支 app 的下限是 16.4（見 `.scratch/rn-rewrite/spec.md`），
  // 那條退路一台機器都用不到，留著只會讓「走的到底是哪一套」變得說不準。
  provider.configure({ apple: { provider: 'appAttest' } });
  const appCheck = initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });

  // 後端明寫出來讓決定看得見：`getAI()` 的預設本來就是 Gemini Developer API，不是 Vertex。
  const ai = getAI(app, { backend: new GoogleAIBackend(), appCheck });
  return { ai, appCheck, config: mount(app) };
}

/**
 * 掛上 Remote Config，掛不起來就回 null。
 *
 * 整段包在 try 裡是有意的：它是保險，不是前置條件。要是它能把 `wire()` 弄壞，讀音預填
 * 就整條靜默死掉——為了一個平常什麼都不改的功能賠掉主功能，方向完全反了。
 */
function mount(app: ReturnType<typeof getApp>): RemoteConfig | null {
  try {
    const config = getRemoteConfig(app);
    config.defaultConfig = REMOTE_FALLBACK;
    // `fetchTimeoutMillis` 原樣讀回來再寫回去：這一趟沒有人在等它（見 `refresh()`），
    // 縮短只會在網路不穩時白白丟掉一次救援機會。這裡只想改間隔那一格，但這個 setter
    // 收的是整份設定，所以另一格得自己帶著走。
    config.settings = {
      minimumFetchIntervalMillis: CONFIG_MAX_AGE_MS,
      fetchTimeoutMillis: config.settings.fetchTimeoutMillis,
    };
    return config;
  } catch {
    return null;
  }
}

/**
 * 去把設定更新一下。丟出去就不管，回頭沒有人在等它。
 *
 * 兩步：先把上次抓到的那份套上（純本地，幾毫秒），再去抓新的。第一步不是多餘的——
 * 上一次開 app 抓回來、卻沒來得及套上的那一份，只有它救得回來。
 * 第一步失敗也不連累第二步：本機那份存壞了是一回事，去抓新的是另一回事。
 *
 * 一個字都不 await 是刻意的。連不上時直接用預設值，不重試、不出提示，尤其不可以擋住
 * 讀音預填。
 */
function refresh(config: RemoteConfig | null): void {
  if (config === null) return;
  void activate(config)
    .catch(() => {})
    .then(() => fetchAndActivate(config))
    .catch(() => {});
}

/**
 * 接一次就好，但**失敗的那一次不要記住**。
 *
 * `wire()` 底下是往原生層的橋接呼叫，失敗不一定是永久的。記住一顆壞掉的接線等於讓這次
 * 開 app 期間的讀音預填死在第一次失敗上，而且那個死法是靜默的——畫面上一個字都不出，
 * 誰都不會發現。忘掉它，下一張卡再試一次。
 *
 * 重試是安全的：`initializeAppCheck()` 與 `getRemoteConfig()` 同一個 app 都回既有那一個，
 * `getAI()` 只是組個物件、不上網。三者都不會丟重複初始化的錯。
 */
let wired: Wiring | null = null;
function ensure(): Wiring {
  wired ??= wire();
  return wired;
}

/** 這一輪要跟原生層要一張權杖。拿不到就交回 `SilentError`——那句話使用者無事可做。 */
async function token(appCheck: AppCheck): Promise<void> {
  await getToken(appCheck).catch(() => {
    throw new SilentError();
  });
}

/**
 * 先去排隊拿憑證，不等它。編輯畫面一打開就叫這支。
 *
 * App Attest 第一次跟 Apple 要憑證要花好幾秒。等到使用者打完詞條才開始排，那幾秒會整段
 * 吃掉問話的預算，第一張卡就可能白等一場。趁他還在打字的時候先排完，之後每一次都是從
 * 快取拿。失敗吞掉：這裡本來就沒有任何話要說，真的沒拿到的話 `askReadingNative()` 會再
 * 走一次同一條路。
 *
 * 順帶把 Remote Config 那一趟也發出去。放在這裡而不是 `wire()` 裡，是因為接線一輩子只做
 * 一次，而這支每開一次編輯畫面就叫一次——更新設定要跟得上使用者的動作，不是跟著開機。
 */
export function prepare(): void {
  try {
    const wiring = ensure();
    refresh(wiring.config);
    void token(wiring.appCheck).catch(() => {});
  } catch {
    // 接線壞了。這裡沒有任何話要說，下一次 `askReadingNative()` 會自己再試一次。
    wired = null;
  }
}

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出帶 key 的錯，與另外兩條路同一組語彙；唯一的例外是 App Check 那一種，
 * 拋出的是 `SilentError`，讀音編輯器接到它就整個不出聲（spec 決定十一）。
 *
 * 撞到 5xx 會自動再問，規矩與網頁版同一套，迴圈住在 `core/lib/reading-retry.ts`。
 * `onAttempt` 選填：開始第 N 次之前叫一聲，N 從 2 起算，畫面靠它把次數顯示出來。
 */
export async function askReadingNative(
  term: string,
  onAttempt?: (attempt: number) => void,
): Promise<unknown> {
  // 接線失敗（套件沒進去、plist 沒被打包）使用者一點辦法都沒有，一個字都不必說。
  let wiring: Wiring;
  try {
    wiring = ensure();
  } catch {
    wired = null;
    throw new SilentError();
  }

  // 憑證自己一份預算，與問模型那一份分開。要不到、或要太久，一律靜默。
  // 這一段在重試的碼表**之外**：總預算從憑證拿到之後才開始算（票 `09` 決定二）。
  await budgeted(token(wiring.appCheck));

  return withRetry(async (budgetMs) => {
    // 每問一次就重建一台。這不是浪費：`getGenerativeModel()` 只是組個物件、不上網，
    // 而擺在這裡才讀得到 `refresh()` 後來才落地的新設定——擺在 `wire()` 裡的話，
    // 這次開 app 期間就永遠是接線那一刻的舊值。
    //
    // 給的是「這一輪還剩幾毫秒」而不是 `TIMEOUT_MS`：碼表不是我們按的，SDK 每次
    // `generateContent()` 自己開一顆，給滿的話重試就等於多送一份 10 秒。
    const model = getGenerativeModel(
      wiring.ai,
      {
        model: setting(wiring.config, REMOTE_MODEL_KEY),
        generationConfig: {
          responseMimeType: 'application/json',
          // **這一下轉型是必要的，而且只有這條路上需要。**
          // `core/` 那份把 `type` 寫成字串（`'object'`、`'array'`），而這個套件的
          // `SchemaType` 是真的 TypeScript `enum`——enum 是「同名不同國籍」，
          // 字面上一樣的 `'object'` 在型別上不算它。執行期兩者是同一個字串
          // （`SchemaType.OBJECT = 'object'`），所以送出去的 JSON 一個位元組都不差。
          // Capacitor 版那條路不必轉，因為 `@firebase/ai` 的同一個東西是字串聯集不是 enum。
          responseSchema: RESPONSE_SCHEMA as unknown as SchemaRequest,
        },
      },
      { timeout: budgetMs },
    );

    let text: string;
    try {
      const result = await model.generateContent(
        promptFor(term, setting(wiring.config, REMOTE_INSTRUCTIONS_KEY)),
      );
      text = result.response.text();
    } catch (error) {
      // 憑證明明剛拿到卻還是被退，那是 Google 那端不認這張票，換回來的是 401。
      // 那條路因此也在這裡收斂——`toReadingError()` 認得 401 就是 App Check 沒過。
      //
      // 翻完才交給重試迴圈判斷：狀態碼收在 `customErrorData.status` 裡，挖回來就好。
      throw toReadingError(error);
    }
    // 沒有候選回覆時 `text()` 回空字串而不是丟錯，與網頁版挖不到那一格是同一件事。
    if (text === '') throw new AppError('gemini.emptyReply');

    return parseReply(text);
  }, onAttempt);
}

// ── 探針：只給資料頁那支診斷畫面用 ──────────────────────────────────

/**
 * 把一個錯攤成一行看得懂的字。
 *
 * 挖的四格都是 SDK 公開介面的一部分：`name`、`code`、`customErrorData.status`、`message`。
 * 最後補一份 `String(error)` 當兜底——連 Error 都不是的東西上面四格全是空的。
 */
function describe(error: unknown): string {
  if (error instanceof SilentError) return 'SilentError（那條刻意不出聲的路，沒有附原因）';
  const seen = (typeof error === 'object' && error !== null ? error : {}) as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    customErrorData?: { status?: unknown };
  };
  const parts = [
    typeof seen.name === 'string' ? `name=${seen.name}` : null,
    typeof seen.code === 'string' ? `code=${seen.code}` : null,
    typeof seen.customErrorData?.status === 'number' ? `status=${seen.customErrorData.status}` : null,
    typeof seen.message === 'string' ? seen.message : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : String(error);
}

/**
 * 逐段跑一次讀音預填，每一段各自報告發生了什麼。**只有資料頁那支探針畫面叫它。**
 *
 * ## 為什麼非要有這一支
 *
 * 上線那條路（`askReadingNative`）**故意把三種失敗都收斂成靜默**：接線壞了、憑證要不到、
 * Google 不認這張票，畫面上一個字都不出（spec 決定十一）。那對使用者是對的——他一點辦法
 * 都沒有。但對維護者是災難：**「壞了」跟「它根本沒試」長得一模一樣**，而且維護者的開發機
 * 是 Windows，看不到裝置上的主控台（`.scratch/rn-rewrite/issues/03`）。
 *
 * 2026-09-01 真機第一次裝上帶 Firebase 的包，讀音預填毫無反應，就卡在這件事上。
 *
 * ## 它跑的是真的那條線，不是另接一份
 *
 * 三段都走 `ensure()` 接出來的同一組東西。**另外接一份的話驗過了也不代表編輯畫面會動**——
 * 那才是這支探針唯一的價值。差別只有一個：這裡不把錯翻成 `SilentError`，原樣攤開。
 *
 * > **資料頁那張票做好時，這一支要跟探針畫面一起消失。**
 */
export async function probeReading(term: string): Promise<string[]> {
  const lines: string[] = [];

  let wiring: Wiring;
  try {
    wiring = ensure();
    const options = wiring.ai.app.options;
    // 專案編號與 app 編號印出來，是為了證明 `GoogleService-Info.plist` 真的進了這個包。
    // 兩格空的話問題在打包，不在憑證。
    lines.push(`1. 接線 OK · project=${options.projectId} · appId=${options.appId}`);
    lines.push(`   Remote Config：${wiring.config === null ? '掛不起來（用程式碼裡的後備值）' : 'OK'}`);
  } catch (error) {
    // 記住一顆壞掉的接線會讓這次開 app 期間都問不成，忘掉它。
    wired = null;
    lines.push(`1. 接線失敗：${describe(error)}`);
    // 接不起來就沒有東西可以往下走了。
    return lines;
  }

  try {
    const result = await getToken(wiring.appCheck);
    // 只印長度不印權杖本身：那是一張這台裝置的通行證，印在畫面上等於請人拍照帶走。
    lines.push(`2. App Check 權杖 OK（長度 ${result.token.length}）`);
  } catch (error) {
    lines.push(`2. App Check 要不到權杖：${describe(error)}`);
    // **仍然往下問**：Google 那端的回覆會說得更清楚（沒帶權杖多半換回 401）。
  }

  try {
    const model = getGenerativeModel(
      wiring.ai,
      {
        model: setting(wiring.config, REMOTE_MODEL_KEY),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA as unknown as SchemaRequest,
        },
      },
      { timeout: TIMEOUT_MS },
    );
    const result = await model.generateContent(
      promptFor(term, setting(wiring.config, REMOTE_INSTRUCTIONS_KEY)),
    );
    const text = result.response.text();
    lines.push(text === '' ? '3. 模型有回應，但內容是空的' : `3. 問到了：${text.slice(0, 300)}`);
  } catch (error) {
    // 這裡刻意**不走** `toReadingError()`：那一支的工作是把錯翻成使用者看得懂的話，
    // 而 401 會被它翻成 `SilentError`——正是這支探針要挖出來的那一種。
    lines.push(`3. 問模型失敗：${describe(error)}`);
  }

  return lines;
}
