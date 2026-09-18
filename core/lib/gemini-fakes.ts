/**
 * 問答的假釋義：整個 app 湊不到四個不同的釋義時，請 Gemini 替每張卡編幾個錯誤的釋義，
 * 把四個選項補滿（問答票 06）。
 *
 * 送請求、碼表、重試、錯誤訊息一律走 `askGemini()`（`gemini-reading.ts`），
 * 模型與逾時也沿用讀音預填那一組，不另設一組（票 06 待決 5）：分成兩組的話，日後換模型時會漏掉一邊。
 *
 * 回覆收不收由 `acceptFakes()` 這支純函式決定，比照讀音那支 `acceptPrefill()`：
 * 任一條不過就整批不收。收下之後怎麼跟真的釋義混著用，是 `startRound()`（`quiz.ts`）的事。
 *
 * **擋不住的那一種錯**：Gemini 編的「錯誤釋義」剛好是這個詞的另一個正確意思。
 * `FAKE_INSTRUCTIONS` 規則 1 明講不可以，但沒有機制事後抓得到。維護者知情後接受這個風險
 * （票 06 待決 1），畫面上也不標哪幾個選項是 AI 編的。
 */
import { askGemini, type ResponseSchema } from './gemini-reading';
import { OPTION_COUNT, type FakeMeanings } from './quiz';
import { toPlainText } from './reading';
import type { Card } from './types';

/**
 * 回覆的形狀：`cards` 一張卡一個物件，依送出去的順序。
 *
 * `term` 排在 `fakes` 前面有兩個用途：模型先抄一次詞條，編假釋義時那個詞就在它剛寫的上文裡
 * （讀音那邊 `termKana` 同一招）；收回來時 `acceptFakes()` 拿它對帳，順序亂了就整批不收。
 */
export const FAKES_SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          fakes: { type: 'array', items: { type: 'string' } },
        },
        required: ['term', 'fakes'],
        propertyOrdering: ['term', 'fakes'],
      },
    },
  },
  required: ['cards'],
  propertyOrdering: ['cards'],
};

/**
 * 給 Gemini 讀的作業指示。與讀音那份 `INSTRUCTIONS` 同一個立場：它不進翻譯檔，
 * 翻了會改變模型的行為。
 *
 * 規則 2 是這張票的重點之一：假釋義要跟著卡片的寫法走，否則一眼就被看穿——
 * 真的釋義是「燒焦、烤焦」，三個假的卻是一整句英文，那一題等於送分。
 */
export const FAKE_INSTRUCTIONS = [
  '你是日語單字問答的出題助手。使用者會給幾張單字卡，每張有一個日文詞條（term）與它的釋義（meaning）。',
  `請替每一張卡編 ${OPTION_COUNT - 1} 個假釋義，當作四選一的錯誤選項。`,
  '規則：',
  '1. 假釋義必須明顯是錯的：不可以是這個詞條的同義詞、近義詞，也不可以是它的另一個正確意思。',
  '2. 假釋義要跟那張卡的釋義用同一種語言、同一種寫法：長度、語氣、標點、詞性都要接近，讓人不能只看形式就猜出哪個是真的。',
  '3. 同一張卡的假釋義彼此不同，也不可以跟那張卡的釋義相同。',
  '4. cards 依給你的順序回答，一張卡一個物件；term 原樣抄回那張卡的詞條。',
].join('\n');

/** 送出去的那一張卡：去掉讀音標記的詞條與釋義，其餘一概不送（隱私權政策「Gemini 問答補選項」）。 */
function sent(card: Card): { term: string; meaning: string } {
  return { term: toPlainText(card.text), meaning: card.meaning.trim() };
}

/** 送出去的那句話：作業指示在前、卡片在後。卡片寫成 JSON，釋義裡有換行或引號也不會斷。 */
export function fakesPrompt(cards: readonly Card[]): string {
  return `${FAKE_INSTRUCTIONS}\n\n卡片：${JSON.stringify(cards.map(sent))}`;
}

/**
 * 替這幾張卡向 Gemini 要假釋義。一輪只問這一次（票 06）：缺的卡全放進同一個請求。
 * 回傳的是還沒驗證的原始回覆，交給 `acceptFakes()` 決定收不收。
 */
export function askFakes(key: string, cards: readonly Card[], doFetch: typeof fetch): Promise<unknown> {
  return askGemini(key, fakesPrompt(cards), FAKES_SCHEMA, doFetch);
}

/**
 * Gemini 的回覆收不收。收下時回傳每張卡的假釋義，以卡片 `id` 為鍵；不收回 `null`。
 *
 * 只驗形狀與對帳，**不驗內容**：假釋義撞到正解、彼此重複、數量不夠，由 `startRound()`
 * 逐張處理——那裡本來就要把真的釋義與假的混在一起去重，同一件事不做兩次。
 *
 * 任一條不過就整批不收：張數對不上、順序對不上（`term` 與送出去的詞條不同）、
 * 或 `fakes` 不是一串字。順序亂掉時收一半，會把 A 卡的假釋義配給 B 卡。
 */
export function acceptFakes(cards: readonly Card[], reply: unknown): FakeMeanings | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const entries = (reply as { cards?: unknown }).cards;
  if (!Array.isArray(entries) || entries.length !== cards.length) return null;

  const fakes = new Map<string, string[]>();
  for (const [index, card] of cards.entries()) {
    const entry = entries[index] as { term?: unknown; fakes?: unknown } | null;
    if (typeof entry !== 'object' || entry === null) return null;
    if (entry.term !== sent(card).term) return null;
    if (!Array.isArray(entry.fakes) || !entry.fakes.every((fake) => typeof fake === 'string')) return null;
    fakes.set(card.id, entry.fakes as string[]);
  }
  return fakes;
}
