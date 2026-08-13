/**
 * 問 Gemini 一個詞條的讀音，回傳未經驗證的原始回覆。
 *
 * 這裡刻意不做任何判斷：回覆是否真的對應這個詞條，一律交給
 * `acceptPrefill`（`reading.ts`）那支純函式決定。本模組只負責把請求送出去、
 * 把 JSON（JavaScript Object Notation，JavaScript 物件表示法）挖出來。
 *
 * 上網的方式由呼叫端遞進來（比照 `cloud-backup.ts` 的 `hooks.fetch`），
 * 這支函式七成的程式碼在做同一件事——把各種失敗翻成使用者看得懂的話，
 * 那部分有 `gemini-reading.test.ts` 守著。
 */

import { t } from '../i18n';

/**
 * 端點與模型固定。日文能力是選這一家唯一的理由（見 issue 02 決定 7）。
 *
 * 原本寫的是 `gemini-2.5-flash`，實測對新申請的金鑰回 404
 * 「no longer available to new users」——模型還在型錄上（ListModels 列得出來、
 * 也宣稱支援 generateContent），但新金鑰已經叫不動它。改成 Google 指定的接班
 * `gemini-3.6-flash`。這裡刻意不用 `gemini-flash-latest` 那種別名：模型在腳下
 * 換人的話，同一個詞的讀音會無預警改答案，寫死才知道自己在跟誰講話。
 */
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

/** 超過這個秒數就當失敗。使用者已經在打釋義了，不能無限等。 */
const TIMEOUT_MS = 10_000;

/**
 * 結構化輸出的形狀：一串漢字一個物件，裡面是拆不拆得開的自述與各格。
 * 保證的只是形狀，內容仍要驗證。
 *
 * `splittable` 排在 `cells` 前面不是隨便放的：模型是一個欄位一個欄位往下生的，
 * 先寫下判斷再填格子，格子才會照著那個判斷走。
 */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      splittable: { type: 'BOOLEAN' },
      cells: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            kanji: { type: 'STRING' },
            reading: { type: 'STRING' },
          },
          required: ['kanji', 'reading'],
          propertyOrdering: ['kanji', 'reading'],
        },
      },
    },
    required: ['splittable', 'cells'],
    propertyOrdering: ['splittable', 'cells'],
  },
};

/**
 * 判準是「每一格的假名是不是該漢字本身的讀音」，**不是**「這個詞是不是熟字訓」——
 * 兩者不等價，而混為一談會出事：`吹雪` 確實登記在常用漢字表付表的熟字訓清單裡，
 * 但它拆得開（吹＝ふ、雪＝ゆき 連濁成 ぶき）。第一版拿熟字訓當判準，模型就把
 * `吹雪` 整串一格；改成含糊的「對應得到」之後又反過來把 `剃刀` 硬拆成
 * `剃[かみ]`／`刀[そり]`。兩次都是判準不夠具體，這一版改問一個可以逐格檢查的問題，
 * 並把兩個詞一正一反寫進去標出界線。
 */
const INSTRUCTIONS = [
  '你是日語讀音標注助手。使用者給一個日文詞條，請標出其中每一串連續漢字的讀音。',
  '規則：',
  '1. 讀音一律用平假名。',
  '2. 每一串先判斷 splittable：逐字檢查，若每一格的假名都是「該漢字本身實際有的音讀或訓讀」就填 true，只要有任何一格的假名不是該漢字的讀音就填 false。連濁與音便造成的音變（雪 ゆき→ぶき）仍算該漢字的讀音。',
  '3. 不要用「是不是熟字訓」判斷。吹雪 是熟字訓但 splittable 為 true：吹=ふ、雪=ぶき 都是各自的讀音。剃刀 的 splittable 為 false：剃 不讀 かみ、刀 不讀 そり。',
  '4. splittable 為 true 就逐字分配，一個漢字一格；為 false 就整串放進一格。',
  '5. 只依詞條本身判斷，不要自行想像上下文。',
  '6. 依詞條中漢字串出現的順序回答，每一串一個物件；cells 各格的 kanji 接起來必須等於原本那串漢字，不可增刪或改寫。',
  '假名、送假名、標點都不要出現在回答裡。',
].join('\n');

/** 回覆的外層形狀，只挖需要的那一段。 */
interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

/** 非 2xx 回應裡 Google 附的那句原因（英文）。挖不到就算了，不要再蓋掉原本的狀態碼。 */
async function reason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : t('gemini.noReason');
  } catch {
    return t('gemini.noReason');
  }
}

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出「可以直接顯示給使用者」的訊息——瀏覽器原生的
 * `Failed to fetch`、`AbortError` 對使用者沒有意義，在這裡就翻成人話。
 *
 * `doFetch` 必填，與 `storage` 同待遇：讓「這個模組會上網」在呼叫端就讀得到。
 */
export async function askReading(key: string, term: string, doFetch: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${INSTRUCTIONS}\n\n詞條：${term}` }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        controller.signal.aborted
          ? t('gemini.timeout', { seconds: TIMEOUT_MS / 1000 })
          : t('gemini.offline'),
      );
    }
    // 金鑰不對是 400／403，額度用完是 429，模型名或版本路徑不對是 404。
    // 光看狀態碼分不出是哪一種，錯誤回應裡那句 message 才講得出原因，一起帶出去。
    if (!response.ok) {
      const why = await reason(response);
      throw new Error(t('gemini.httpError', { status: response.status, reason: why }));
    }

    let text: unknown;
    try {
      const body = (await response.json()) as GenerateContentResponse;
      text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch {
      throw new Error(t('gemini.unreadable'));
    }
    if (typeof text !== 'string') throw new Error(t('gemini.emptyReply'));

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(t('gemini.notJson'));
    }
  } finally {
    clearTimeout(timer);
  }
}
