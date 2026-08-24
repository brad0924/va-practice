/**
 * iOS 上的讀音預填：固定金鑰、走 Firebase AI Logic，使用者什麼都不必設定。
 *
 * 與網頁版分岔的只有「請求怎麼送出去」這一段（spec 決定十六）。提示詞、回覆的形狀、
 * 逾時的秒數、以及回來之後那道 `acceptPrefill` 的驗證，全部沿用 `gemini-reading.ts`
 * 那一份——模型看到的字兩邊一模一樣，差別只在誰把它交出去。
 *
 * 一個例外：模型名字與判準那一段在這條路上先問 Firebase Remote Config，問不到才用
 * `gemini-reading.ts` 裡那一份（issue 03）。維護者因此可以在模型被下架、或判準寫錯時
 * 直接改主控台，不必重新送審。網頁版沒有這條路，永遠用程式碼裡的值。
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
import { getAI, getGenerativeModel, GoogleAIBackend, type AI } from 'firebase/ai';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { activate, fetchAndActivate, getRemoteConfig, getString, type RemoteConfig } from 'firebase/remote-config';

import { AppError, SilentError } from './app-error';
import { toReadingError } from './ai-logic-error';
import {
  INSTRUCTIONS,
  MODEL,
  RESPONSE_SCHEMA,
  TIMEOUT_MS,
  parseReply,
  promptFor,
  remoteOrDefault,
} from './gemini-reading';
import { withRetry } from './reading-retry';

/**
 * Remote Config 上那兩個參數的名字，與各自在程式碼裡的後備值。主控台上叫什麼，這裡就是什麼。
 *
 * 名字與後備值綁在同一張表，不散在兩處：`defaultConfig` 交給 SDK 的那一份、和讀不到時
 * 自己退回的那一份，永遠是同一個值，不會各自漂移。
 *
 * 為什麼要有這條路（issue 03）：固定金鑰把「模型被下架」的修復成本從幾分鐘拉到幾天。
 * 自備金鑰時那是零星使用者踩到、改個字串 push 上去；固定金鑰加 iOS 是所有人同時停擺，
 * 而使用者沒有自救途徑，維護者要重新打包送審、等一到兩天，還可能被退件。`ADR-0005`
 * 記過一次真實事故（`gemini-2.5-flash` 對新金鑰回 404），判準那一段也實際改過兩次。
 */
const MODEL_KEY = 'gemini_model';
const INSTRUCTIONS_KEY = 'gemini_instructions';
const FALLBACK = { [MODEL_KEY]: MODEL, [INSTRUCTIONS_KEY]: INSTRUCTIONS };

/**
 * 抓回來的設定放這麼久就算過期，下一次會重新去抓。**明確設定，不吃 SDK 預設的 12 小時。**
 *
 * 一小時的理由：這條路存在的全部目的是「出事時快點救得回來」，12 小時等於出事當天多數
 * 人整天都救不回來。往下不再壓，是因為救援之外的每一次抓取都只是白跑一趟網路——出事是
 * 罕見事件，把常態成本壓在每小時一次就夠了。一小時也正是 Capacitor 版 Remote Config
 * 外掛的預設值，不是憑空挑的數字。
 *
 * **這不是「立刻生效」。** 每開一次編輯畫面會請 SDK 抓一次，但這個間隔沒過的話它直接
 * 從快取回答、不上網。所以主控台改完之後，最快是「距上次抓取滿一小時後的下一次開編輯
 * 畫面」才拿得到新值；抓得比使用者打字快的話同一張卡就用得上，慢了就下一張。
 * 實務上仍是「幾小時」對上「送審一到兩天」。
 *
 * `fetchTimeoutMillis` 刻意留 SDK 預設的 60 秒：這一趟沒有人在等它（見 `refresh()`），
 * 縮短只會在網路不穩時白白丟掉一次救援機會。
 */
const CONFIG_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * 這次要用的那個值。Remote Config 整個掛掉（`config` 是 null）也照樣答得出來。
 */
function setting(config: RemoteConfig | null, key: keyof typeof FALLBACK): string {
  const fallback = FALLBACK[key];
  return config === null ? fallback : remoteOrDefault(getString(config, key), fallback);
}

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
 * 接線一次就備齊的兩樣東西：問話的入口，與那份可以被遠端改掉的設定。
 *
 * `config` 允許是 null，這一格就是「它是保險，不是前置條件」寫成型別的樣子：
 * Remote Config 掛不起來時整條路照走，用的是程式碼裡那份後備值。
 */
interface Wiring {
  ai: AI;
  config: RemoteConfig | null;
}

/**
 * 接線：把原生那一端的設定與憑證接到 JS SDK 上，並把 Remote Config 掛好。
 *
 * 設定值跟原生要，不在 repo 裡另抄一份。這麼做順手回答了一個問題：App Check 權杖是綁在
 * Firebase 的 App ID 上的，而原生層拿到的權杖屬於 `GoogleService-Info.plist` 裡那支 iOS
 * app。從同一個來源取設定，JS SDK 用的就必然是同一個 App ID，不會對不上。
 *
 * 這一段完全不上網，離線也接得起來——憑證是 SDK 稍後要送請求時才去拿的，
 * 而 Remote Config 在這裡只是掛上去，真的去抓是 `refresh()` 的事。
 */
async function wire(): Promise<Wiring> {
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
  return { ai: getAI(app, { backend: new GoogleAIBackend() }), config: mount(app) };
}

/**
 * 掛上 Remote Config，掛不起來就回 null。
 *
 * 整段包在 try 裡是有意的：它是保險，不是前置條件。要是它能把 `wire()` 弄壞，讀音預填
 * 就整條靜默死掉——為了一個平常什麼都不改的功能賠掉主功能，方向完全反了。
 */
function mount(app: FirebaseApp): RemoteConfig | null {
  try {
    const config = getRemoteConfig(app);
    config.defaultConfig = FALLBACK;
    config.settings.minimumFetchIntervalMillis = CONFIG_MAX_AGE_MS;
    return config;
  } catch {
    return null;
  }
}

/**
 * 去把設定更新一下。丟出去就不管，回頭沒有人在等它。
 *
 * 兩步：先把上次抓到的那份套上（純本地，幾毫秒），再去抓新的。第一步不是多餘的——
 * 上一次開 app 抓回來、卻沒來得及套上的那一份，只有它救得回來；`fetchAndActivate()`
 * 抓不到時（離線、或間隔還沒到）根本走不到它自己那一步套用。
 * 第一步失敗也不連累第二步：本機那份存壞了是一回事，去抓新的是另一回事。
 *
 * 一個字都不 await 是刻意的。連不上時直接用預設值，不重試、不出提示，尤其不可以擋住
 * 讀音預填。抓完才回來的話，第一張卡就得替它等一趟網路，而那趟網路多數時候什麼都沒改。
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
 * `getOptions()` 與 `initialize()` 都是往原生層的橋接呼叫，失敗不一定是永久的。
 * 記住一顆被拒絕的 promise 等於讓這次開 app 期間的讀音預填死在第一次失敗上，
 * 而且那個死法是靜默的——畫面上一個字都不出，誰都不會發現。忘掉它，下一張卡再試一次。
 *
 * 重試是安全的：`initializeApp()` 同名同設定回的是既有那一個；`initializeAppCheck()`
 * 比對 `getToken` 的內容認得出是同一支，也回既有那一個；`getRemoteConfig()` 同一個 app、
 * 同一組（空的）選項也回既有那一個。三者都不會丟重複初始化的錯。
 */
let wired: Promise<Wiring> | null = null;
function ensure(): Promise<Wiring> {
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
 *
 * 順帶把 Remote Config 那一趟也發出去。放在這裡而不是 `wire()` 裡，是因為接線一輩子只做
 * 一次，而這支每開一次編輯畫面就叫一次——更新設定要跟得上使用者的動作，不是跟著開機。
 * 真正上不上網由 SDK 的間隔決定（`CONFIG_MAX_AGE_MS`），沒到期它直接從快取回答。
 * 使用者打詞條的那幾秒通常夠它回來，主控台上剛改的值因此在同一次開 app 就用得上。
 */
export function prepare(): void {
  void ensure()
    .then((wiring) => {
      refresh(wiring.config);
      return appCheckToken();
    })
    .catch(() => {});
}

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出帶 key 的錯，與網頁版同一組語彙；唯一的例外是 App Check 那一種，
 * 拋出的是 `SilentError`，讀音編輯器接到它就整個不出聲（spec 決定十一）。
 *
 * 撞到 5xx 會自動再問，規矩與網頁版同一套，迴圈住在 `reading-retry.ts`（票 09）。
 * `onAttempt` 選填：開始第 N 次之前叫一聲，N 從 2 起算，畫面靠它把次數顯示出來。
 */
export async function askReadingNative(
  term: string,
  onAttempt?: (attempt: number) => void,
): Promise<unknown> {
  // 接線失敗（外掛沒進去、plist 沒被打包）使用者一點辦法都沒有，一個字都不必說。
  const wiring = await ensure().catch(() => {
    throw new SilentError();
  });

  // 憑證自己一份預算，與問模型那一份分開。要不到、或要太久，一律靜默。
  // 這一段在重試的碼表**之外**：總預算從憑證拿到之後才開始算（票 09 決定二）。
  await budgeted(appCheckToken()).catch(() => {
    throw new SilentError();
  });

  return withRetry(async (budgetMs) => {
    // 每問一次就重建一台。這不是浪費：`getGenerativeModel()` 只是組個物件、不上網，
    // 而擺在這裡才讀得到 `refresh()` 後來才落地的新設定——擺在 `wire()` 裡的話，
    // 這次開 app 期間就永遠是接線那一刻的舊值。
    //
    // 逾時掛在這裡，管的是送出去到收回來那一段；跟 Apple 要憑證那一段不在它的預算裡，
    // 所以 `prepare()` 要提早把憑證暖好。
    //
    // 給的是「這一輪還剩幾毫秒」而不是 `TIMEOUT_MS`：碼表不是我們按的，SDK 每次
    // `generateContent()` 自己開一顆，給滿的話重試就等於多送一份 10 秒（票 09 決定二）。
    // 本來就每次重建，這裡是一個減法，不必另外包 `Promise.race`。
    const model = getGenerativeModel(
      wiring.ai,
      {
        model: setting(wiring.config, MODEL_KEY),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      },
      { timeout: budgetMs },
    );

    let text: string;
    try {
      const result = await model.generateContent(
        promptFor(term, setting(wiring.config, INSTRUCTIONS_KEY)),
      );
      text = result.response.text();
    } catch (error) {
      // 憑證明明剛拿到卻還是被退，那是 Google 那端不認這張票，換回來的是 401。
      // 那條路因此也在這裡收斂——`toReadingError()` 認得 401 就是 App Check 沒過。
      // 2026-08-20 在真機上驗過：畫面上一個字都沒有，小框裡是 status 401。
      //
      // 翻完才交給重試迴圈判斷：狀態碼收在 `params.status` 裡，挖回來就好，
      // 不必在這裡把「怎麼從 SDK 錯誤挖出 status」再抄一份（票 09 決定三）。
      throw toReadingError(error);
    }
    // 沒有候選回覆時 `text()` 回空字串而不是丟錯，與網頁版挖不到那一格是同一件事。
    if (text === '') throw new AppError('gemini.emptyReply');

    return parseReply(text);
  }, onAttempt);
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
