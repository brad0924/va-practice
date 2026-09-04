/**
 * 問 Gemini 一個詞條的讀音，回傳未經驗證的原始回覆。
 *
 * 這裡刻意不做任何判斷：回覆是否真的對應這個詞條，一律交給
 * `acceptPrefill`（`reading.ts`）那支純函式決定。本模組只負責把請求送出去、
 * 把 JSON（JavaScript Object Notation，JavaScript 物件表示法）挖出來。
 *
 * 上網的方式由呼叫端遞進來（比照 `cloud-backup.ts` 的 `hooks.fetch`），
 * 這支函式七成的程式碼在做同一件事——把各種失敗變成一條說得出原因的 key，
 * 那部分有 `gemini-reading.test.ts` 守著。真正的文字要到畫面顯示的當下才查表。
 */

import { AppError } from './app-error';

/**
 * OpenAPI 的資料型別。六個值抄 Firebase 的 `SchemaType`（`@firebase/ai` 的
 * `ai-public.d.ts`），與 Google 那端收的是同一組字串。
 */
type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

/**
 * 結構化輸出那份形狀的型別。
 *
 * **寫成 `type` 而不是 `interface` 是必要的**：兩條 Firebase 路徑收的
 * `SchemaRequest` 帶著 `[key: string]: unknown` 這個索引簽章，而 TypeScript 只肯替
 * `type` 別名自動補上索引簽章，`interface` 不補——寫成 interface 的話兩邊都會編不過。
 *
 * > **這裡原本直接 `import type { SchemaRequest } from 'firebase/ai'`**，理由是「那一側的
 * > 要求比 REST 嚴，過得了它就一定過得了 REST」。票 `16` 拿掉了：React Native 版也要共用
 * > 這一份，而 `mobile/` 裡裝的是 `@react-native-firebase/ai`，沒有 `firebase` 這個套件。
 * > CI 上手機那個工作只在 `mobile/` 裡裝套件，`tsc --noEmit` 因此找不到那支型別檔。
 * >
 * > 換來的另一個好處是 `core/` 不再依賴任何外部套件的型別——它是兩個平台共用的那一層，
 * > 一個只有其中一邊裝得到的 import 本來就不該住在這裡。
 * >
 * > 代價是嚴格度改由這裡自己守：欄位打錯字時不再有 Firebase 那份型別擋著。
 * > 底下 `RESPONSE_SCHEMA` 仍然要通過兩邊 SDK 的型別檢查，那是最後一道。
 */
export type ResponseSchema = {
  type: SchemaType;
  properties?: { [key: string]: ResponseSchema };
  items?: ResponseSchema;
  required?: string[];
  propertyOrdering?: string[];
};

/**
 * 端點與模型固定。日文能力是選這一家唯一的理由（見 issue 02 決定 7）。
 *
 * **為什麼是 `gemini-3.5-flash-lite`。** 前一版 `gemini-3.6-flash` 每十次有三次等不到
 * 回覆，而分段計時證明那三次百分之百卡在「問模型」那一段，與金鑰、App Check、Firebase
 * 代理都無關（`reading-prefill` 票 06）。病根是新一代模型回答前會自己想一遍，想多久由它
 * 動態決定、每次不一樣。`flash-lite` 天生想得少：`TIMEOUT_MS` 一格沒動，實測逾時從
 * 3/10 掉到 **0/10**。
 *
 * **代價也量過，別讓下一個人重踩。** `ADR-0005` 警告小模型會很有自信講錯熟字訓與連濁，
 * 拿 repo 自己的兩個界線樣本考它：`剃刀` 穩定答對（整串一格）；`吹雪` 五次錯一次，錯的
 * 那次把 `吹`＝ふく、`雪`＝ふき 兩個漢字各自單獨的讀音接起來交差，沒有連濁成 ふぶき。`INSTRUCTIONS`
 * 規則 4 逐字寫著正確答案，它照樣抄錯——那 1/5 是模型自己晃，不是判準含糊。對照組隔天量到了：
 * `gemini-3.6-flash` 打五次 `吹雪` **全對**，所以那 1/5 是換模型換來的退步，不是這條路一直以來
 * 的樣子。維護者知情後仍選擇保留——`0/10` 的逾時值這個價。想把這一格贏回來的嘗試記在票 08。
 *
 * 更早之前寫的是 `gemini-2.5-flash`，實測對新申請的金鑰回 404「no longer available to
 * new users」——模型還在型錄上（ListModels 列得出來、也宣稱支援 generateContent），但新
 * 金鑰已經叫不動它。**換型號一定要真的打一次，型錄查不出這件事。**
 *
 * 這裡刻意不用 `gemini-flash-latest` 那種別名：模型在腳下換人的話，同一個詞的讀音會
 * 無預警改答案，寫死才知道自己在跟誰講話。
 *
 * iOS 那條路改成先問 Firebase Remote Config 的 `gemini_model`，問不到才用這個字串
 * （issue 03）。這不牴觸上一段：那裡拒絕的是 Google 想換就換、我們不知道；Remote Config
 * 是維護者自己按發布才換，知道換成什麼、什麼時候換。方向盤在誰手上，差別在這裡。
 *
 * 網頁版沒有 Firebase SDK，永遠用這個字串。
 */
export const MODEL = 'gemini-3.5-flash-lite';

/** 網頁版那條路的端點。iOS 那條走 Firebase AI Logic 的 SDK，不經過這個網址。 */
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** 超過這個秒數就當失敗。使用者已經在打釋義了，不能無限等。兩條路徑同一個預算。 */
export const TIMEOUT_MS = 10_000;

/**
 * 結構化輸出的形狀：最外層一個物件，裡面是整個詞條的假名與各串漢字。
 * `runs` 一串漢字一個物件，裡面是拆不拆得開的自述與各格。
 * 保證的只是形狀，內容仍要驗證。
 *
 * **欄位順序全部是刻意排的**，因為模型是一個欄位一個欄位往下生的，前面寫過的字
 * 會成為後面每一格的上文。`splittable` 排在 `cells` 前面，格子才會照著那個判斷走；
 * `termKana` 排在 `runs` 前面，是同一招用在讀音上——先把整個詞條唸起來的音寫下來，
 * 填 `吹` 的時候 `ふぶき` 已經在它自己剛寫的上文裡，就不會拿 `吹`＝ふく 接 `雪`＝ふき
 * 交差（票 08）。
 *
 * **`termKana` 收下但不驗證。** `acceptPrefill` 讀都不讀它：鷹架的用途在生成的當下
 * 就結束了，收回來之後拿它對帳是另一個決定，等這一輪的數字出來再談。
 *
 * **兩條路徑共用這一份**（spec 決定十六）。型別名寫小寫是為了共用：Firebase AI Logic 的
 * SDK 只認小寫，寫大寫連編譯都過不了；而這一份原本的大寫走的是 REST 端點。Google 兩份
 * 文件各給一種寫法、都沒有明講另一種收不收，最後是維護者拍板改小寫、自己在網頁版實測。
 *
 * 型別是 `ResponseSchema`，見上面那一段——它原本借的是 Firebase 的 `SchemaRequest`，
 * 票 `16` 改成 `core/` 自己的一份。
 */
export const RESPONSE_SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    termKana: { type: 'string' },
    runs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          splittable: { type: 'boolean' },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kanji: { type: 'string' },
                reading: { type: 'string' },
              },
              required: ['kanji', 'reading'],
              propertyOrdering: ['kanji', 'reading'],
            },
          },
        },
        required: ['splittable', 'cells'],
        propertyOrdering: ['splittable', 'cells'],
      },
    },
  },
  required: ['termKana', 'runs'],
  propertyOrdering: ['termKana', 'runs'],
};

/**
 * 判準是「每一格的假名是不是該漢字本身的讀音」，**不是**「這個詞是不是熟字訓」——
 * 兩者不等價，而混為一談會出事：`吹雪` 確實登記在常用漢字表付表的熟字訓清單裡，
 * 但它拆得開（吹＝ふ、雪＝ゆき 連濁成 ぶき）。第一版拿熟字訓當判準，模型就把
 * `吹雪` 整串一格；改成含糊的「對應得到」之後又反過來把 `剃刀` 硬拆成
 * `剃[かみ]`／`刀[そり]`。兩次都是判準不夠具體，這一版改問一個可以逐格檢查的問題，
 * 並把兩個詞一正一反寫進去標出界線。
 *
 * iOS 那條路改成先問 Firebase Remote Config 的 `gemini_instructions`，問不到才用這一段
 * （issue 03）。判準改過兩次都是踩到坑才發現的，能不送審就改是這張票的重點之一。
 */
export const INSTRUCTIONS = [
  '你是日語讀音標注助手。使用者給一個日文詞條，請標出其中每一串連續漢字的讀音。',
  '規則：',
  '1. 先填 termKana：整個詞條從頭到尾唸起來的假名，一串到底，詞條裡本來就有的假名與送假名也要照唸（取り消し 的 termKana 是 とりけし）。填完這一格再往下填 runs，runs 各格的假名接起來要跟 termKana 對得上。',
  '2. 讀音一律用平假名。',
  '3. 每一串先判斷 splittable：逐字檢查，若每一格的假名都是「該漢字本身實際有的音讀或訓讀」就填 true，只要有任何一格的假名不是該漢字的讀音就填 false。連濁與音便造成的音變（雪 ゆき→ぶき）仍算該漢字的讀音。',
  '4. 不要用「是不是熟字訓」判斷。吹雪 是熟字訓但 splittable 為 true：吹=ふ、雪=ぶき 都是各自的讀音。剃刀 的 splittable 為 false：剃 不讀 かみ、刀 不讀 そり。',
  '5. splittable 為 true 就逐字分配，一個漢字一格；為 false 就整串放進一格。',
  '6. 只依詞條本身判斷，不要自行想像上下文。',
  '7. runs 依詞條中漢字串出現的順序回答，每一串一個物件；cells 各格的 kanji 接起來必須等於原本那串漢字，不可增刪或改寫。',
  'cells 各格的 kanji 只放漢字，假名、送假名、標點都不要出現；termKana 不受這一條限制。',
].join('\n');

/**
 * 送出去的那句話：判準在前、詞條在後。接法兩條路徑共用（spec 決定十六）。
 *
 * 判準本身要用參數遞進來，不在這裡直接讀 `INSTRUCTIONS`——iOS 那條路遞的是 Remote Config
 * 抓回來的那一段，網頁版遞的是模組裡這一份。寫成必填而不是預設值，是要讓「這句話是誰
 * 決定的」在呼叫端讀得到。
 */
export function promptFor(term: string, instructions: string): string {
  return `${instructions}\n\n詞條：${term}`;
}

/**
 * 遠端調過的那個字串，與程式碼裡這一份預設值之間選一個。
 *
 * 空白一律當成「沒調」：主控台上把值清成空白是手滑，不是「請你送出一句空的判準」。
 * 回傳的是去掉頭尾空白的值——模型名字前後多一個換行就會變成 404，判準那一段
 * 去掉頭尾空白則不影響任何事。
 *
 * 只有 iOS 那條路用得到（`mobile/lib/gemini-reading-native.ts`），放在這裡是因為這裡測得動：
 * 那支檔案 import 了原生模組，在 node 底下根本載不起來。程式碼裡那兩份預設值
 * （`MODEL`、`INSTRUCTIONS`）本來也就住在這個模組。
 */
export function remoteOrDefault(remote: string, fallback: string): string {
  const value = remote.trim();
  return value === '' ? fallback : value;
}

/**
 * Firebase Remote Config 上那兩個參數的名字，與各自在程式碼裡的後備值。
 * **主控台上叫什麼，這裡就是什麼。**
 *
 * **兩條 Firebase 路徑（Capacitor 版 iOS 與 React Native 版）共用這一份。**
 * 背後是同一個 Firebase 專案的同兩個參數——維護者改一次主控台，兩支 app 一起跟上；
 * 各自抄一份的話，改到一半漏掉一邊時沒有任何測試會紅，而症狀是「那支 app 安靜地
 * 一直用程式碼裡的舊值」，沒有人看得出來。
 *
 * 放在這個模組而不是另開一支：後備值（`MODEL`、`INSTRUCTIONS`）本來就住在這裡，
 * 名字與它要救的那個值擺在一起才不會各自漂移。
 */
export const REMOTE_MODEL_KEY = 'gemini_model';
export const REMOTE_INSTRUCTIONS_KEY = 'gemini_instructions';
export const REMOTE_FALLBACK = {
  [REMOTE_MODEL_KEY]: MODEL,
  [REMOTE_INSTRUCTIONS_KEY]: INSTRUCTIONS,
};

/**
 * 抓回來的設定放這麼久就算過期，下一次會重新去抓。**明確設定，不吃 SDK 預設的 12 小時。**
 *
 * 一小時的理由：這條路存在的全部目的是「出事時快點救得回來」，12 小時等於出事當天
 * 多數人整天都救不回來。往下不再壓，是因為救援之外的每一次抓取都只是白跑一趟網路——
 * 出事是罕見事件，把常態成本壓在每小時一次就夠了。一小時也正是 Capacitor 版
 * Remote Config 外掛的預設值，不是憑空挑的數字。
 *
 * **這不是「立刻生效」。** 每開一次編輯畫面會請 SDK 抓一次，但這個間隔沒過的話它直接
 * 從快取回答、不上網。實務上仍是「幾小時」對上「送審一到兩天」。
 *
 * 與上面那兩個參數名同一個理由住在這裡：兩條 Firebase 路徑共用，各存一份會漂。
 */
export const CONFIG_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * 模型塞在回覆裡的那份 JSON 字串解析成值。回的是 `unknown`——形狀由 schema 保證，
 * 內容要不要信是 `acceptPrefill`（`reading.ts`）的事，不在這裡判斷。
 */
export function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('gemini.notJson');
  }
}

/** 回覆的外層形狀，只挖需要的那一段。 */
interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

/**
 * 非 2xx 回應裡 Google 附的那句原因（英文）。挖不到回 null，不要再蓋掉原本的狀態碼。
 *
 * 挖不到時刻意**不在這裡補上「沒有附原因」那句話**：那是我們自己的字，在這裡查表
 * 等於把語言凍在丟出錯誤的那一刻。改由呼叫端換一條 key，讓查表留在顯示的當下。
 * 挖得到的那句是 Google 給的，語言不歸我們管，只能原樣帶進參數。
 */
async function reason(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : null;
  } catch {
    return null;
  }
}

/**
 * 值得再問一次的那幾個狀態碼：伺服器那端出事，跟我們送的東西無關。
 *
 * 503 那句話字面就是「請稍後再試」，這是最該自動重試的一種。其餘全部一次就放棄：
 * 400／403 金鑰不會自己變對、404 模型不會自己回來、429 額度重試只會燒更快，
 * 連不上多半是使用者自己的網路，逾時本身就是把預算燒光的那種失敗（票 07 決定二）。
 *
 * export 出去給 iOS 那條路的 `reading-retry.ts` 讀同一份。兩邊各抄一份會漂移，
 * 漂移的下場是一邊認得 503、另一邊不認（票 09）。
 */
export const TRANSIENT = new Set([500, 502, 503, 504]);

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出「可以直接顯示給使用者」的訊息——瀏覽器原生的
 * `Failed to fetch`、`AbortError` 對使用者沒有意義，在這裡就翻成人話。
 *
 * 撞到 `TRANSIENT` 那幾個狀態碼就自動再問，**次數不設上限、中間不停頓**，問到成功或
 * 碼表到期為止。碼表按在整支函式最外層，重試沒有自己的預算——像微波爐轉 10 分鐘的旋鈕，
 * 中途換一盤菜進去，旋鈕不會回到 10 分。使用者的等待上限因此一秒都沒變。
 * 沒裝次數煞車是刻意的，理由與要量的兩個數字記在票 07。
 *
 * `doFetch` 必填，與 `storage` 同待遇：讓「這個模組會上網」在呼叫端就讀得到。
 * `onAttempt` 選填：開始第 N 次嘗試前叫一聲，N 從 2 起算，畫面靠它把次數顯示出來。
 */
export async function askReading(
  key: string,
  term: string,
  doFetch: typeof fetch,
  onAttempt?: (attempt: number) => void,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  /**
   * 這一輪最後收到的那個 5xx。碼表到期時要丟它而不是 `gemini.timeout`——
   * 使用者真正撞到的是 503，講成「等超過 10 秒」跟事實對不上（票 07）。
   */
  let lastTransient: AppError | null = null;
  /** 碼表到期時該講的那句話：撞過 5xx 就講 5xx，單純是慢才講逾時。 */
  const expired = () =>
    lastTransient ?? new AppError('gemini.timeout', { seconds: TIMEOUT_MS / 1000 });
  try {
    for (let attempt = 1; ; attempt++) {
      // 碼表到期就收手。`AbortController` 踩過一次就永遠是踩下的狀態，因此這裡不會誤判。
      if (controller.signal.aborted) throw expired();
      if (attempt > 1) onAttempt?.(attempt);

      let response: Response;
      try {
        response = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptFor(term, INSTRUCTIONS) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        });
      } catch {
        throw controller.signal.aborted ? expired() : new AppError('gemini.offline');
      }
      // 金鑰不對是 400／403，額度用完是 429，模型名或版本路徑不對是 404，
      // 5xx 是伺服器那端出事——四種裡唯一與我們無關、也唯一再問一次會好的一種。
      // 光看狀態碼分不出是哪一種，錯誤回應裡那句 message 才講得出原因，一起帶出去。
      if (!response.ok) {
        const why = await reason(response);
        const failure =
          why === null
            ? new AppError('gemini.httpErrorNoReason', { status: response.status })
            : new AppError('gemini.httpError', { status: response.status, reason: why });
        if (!TRANSIENT.has(response.status)) throw failure;
        lastTransient = failure;
        continue;
      }

      let text: unknown;
      try {
        const body = (await response.json()) as GenerateContentResponse;
        text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch {
        throw new AppError('gemini.unreadable');
      }
      if (typeof text !== 'string') throw new AppError('gemini.emptyReply');

      return parseReply(text);
    }
  } finally {
    clearTimeout(timer);
  }
}
