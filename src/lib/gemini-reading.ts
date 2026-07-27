/**
 * 問 Gemini 一個詞條的讀音，回傳未經驗證的原始回覆。
 *
 * 這裡刻意不做任何判斷：回覆是否真的對應這個詞條，一律交給
 * `acceptPrefill`（`reading.ts`）那支純函式決定。本模組只負責把請求送出去、
 * 把 JSON（JavaScript Object Notation，JavaScript 物件表示法）挖出來，
 * 比照 `cloud-backup.ts` 直接用全域 `fetch`，因此沒有測試檔。
 */

/** 端點與模型固定。日文能力是選這一家唯一的理由（見 issue 02 決定 7）。 */
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/** 超過這個秒數就當失敗。使用者已經在打釋義了，不能無限等。 */
const TIMEOUT_MS = 10_000;

/**
 * 結構化輸出的形狀：一串漢字一個陣列，串內一格一個物件。
 * 保證的只是形狀，內容仍要驗證。
 */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
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
};

const INSTRUCTIONS = [
  '你是日語讀音標注助手。使用者給一個日文詞條，請標出其中每一串連續漢字的讀音。',
  '規則：',
  '1. 讀音一律用平假名。',
  '2. 一串漢字原則上逐字分配，一個漢字一格。',
  '3. 分不開的（熟字訓，例如 剃刀 唸 かみそり）整串放一格，不要硬拆。',
  '4. 只依詞條本身判斷，不要自行想像上下文。',
  '5. 依詞條中漢字串出現的順序回答，每一串一個陣列；各格的 kanji 接起來必須等於原本那串漢字，不可增刪或改寫。',
  '假名、送假名、標點都不要出現在回答裡。',
].join('\n');

/** 回覆的外層形狀，只挖需要的那一段。 */
interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

/**
 * 問一個詞條。成功時回傳 AI 那份 JSON 解析後的值（型別是 `unknown`，還沒被信任）。
 *
 * 失敗一律拋出「可以直接顯示給使用者」的訊息——瀏覽器原生的
 * `Failed to fetch`、`AbortError` 對使用者沒有意義，在這裡就翻成人話。
 */
export async function askReading(key: string, term: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
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
        controller.signal.aborted ? `等超過 ${TIMEOUT_MS / 1000} 秒沒有回覆` : '連不上 Gemini',
      );
    }
    // 金鑰不對是 400／403，額度用完是 429，都落在這裡。
    if (!response.ok) throw new Error(`Gemini 回了 ${response.status}`);

    let text: unknown;
    try {
      const body = (await response.json()) as GenerateContentResponse;
      text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch {
      throw new Error('讀不懂 Gemini 的回覆');
    }
    if (typeof text !== 'string') throw new Error('Gemini 沒有回覆內容');

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Gemini 回的不是 JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}
