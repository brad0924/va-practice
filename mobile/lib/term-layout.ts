/**
 * 振假名的排版算式。React Native 沒有 `<ruby>`，做法是**兩層 `<Text>` 疊字**：
 * 把詞條切成一欄一欄，每欄上假名下本文，整排 `flexWrap` 換行。
 *
 * 這一題在 `.scratch/rn-spike/issues/01` 已經在真機上驗過一次，做法與量到的位移沿用那張票，
 * 不重做。畫的部分在 `../ui/term.tsx`，這裡只有算式，因此測得動。
 *
 * > **`readingPull` 那個假設在 iOS 上還沒有人驗過。** 它假設 `lineHeight` 多出來的空間
 * > 上下平分——這在瀏覽器上量得到確實如此，UIKit 有可能全部放在字的上方。假名離漢字太遠
 * > 或壓到漢字，調的就是 `READING_PULL_ADJUST`。票 `06` 的驗收要求在真機上重新量一次，
 * > 順便調一次系統字級看看。
 */
import { parseReading, toPlainText } from '@core/lib/reading';

/** 一欄：底下的本文，以及（標了音才有的）上方假名。 */
export interface TermColumn {
  base: string;
  reading?: string;
}

/**
 * 漢字字級。`react-native` 的 `<Text>` 會自己跟著系統字級放大，但 `lineHeight` 與
 * `marginBottom` 不會——只放大字、不放大位移的話，假名在大字級下就會壓到漢字。
 * 因此這一整組都自己乘 `fontScale`，畫的那一端一律關掉 `allowFontScaling`。
 */
const TERM_FONT_SIZE = 34;

/** 假名相對漢字的比例。沿用網頁版 `src/styles.css` 的 `.term ruby rt`（0.42em）。 */
const KANA_RATIO = 0.42;

/**
 * 漢字那一行的行距倍率。沿用網頁版 `.term` 的 `line-height: 1.9`——多出來的 0.9 em
 * 上下平分，**漢字底下因此補到 0.45 em**，換行時兩排之間也是同一個疏密。
 */
export const BASE_LINE_RATIO = 1.9;

/**
 * 真機量出來要再加減的那一點。**預設 0**：先照「多出來的空間上下平分」這個假設走，
 * 量完不對再改這裡，正負都可以（正的把假名往下推，負的往上拉）。
 */
const READING_PULL_ADJUST = 0;

/** 欄與欄之間不留縫，字距靠字身自己決定，與 `<ruby>` 一致。 */
const COLUMN_GAP = 0;

export interface TermMetrics {
  term: number;
  kana: number;
  /** 假名的行框剛好一個字身，`lineHeight` 多出來的空間不會把它推離漢字。 */
  kanaLineHeight: number;
  baseLineHeight: number;
  /** 假名要往下貼多少，才會讓它的字身底端碰到漢字的字身頂端。用成負的 `marginBottom`。 */
  readingPull: number;
  columnGap: number;
}

export function termMetrics(fontScale: number): TermMetrics {
  const term = TERM_FONT_SIZE * fontScale;
  const kana = term * KANA_RATIO;
  const baseLineHeight = term * BASE_LINE_RATIO;
  return {
    term,
    kana,
    kanaLineHeight: kana,
    baseLineHeight,
    // 漢字上方那半份行距就是假名與漢字之間的縫，把它整個抵掉。
    readingPull: ((BASE_LINE_RATIO - 1) / 2) * term + READING_PULL_ADJUST * fontScale,
    columnGap: COLUMN_GAP,
  };
}

/**
 * 詞條切成一欄一欄。`showReading` 為 false 時只給原文，漢字不標讀音——
 * 卡片正面就是靠這點來測驗讀法的，與網頁版 `src/ui/reading-html.ts` 同一條規矩。
 *
 * **沒標音的部分逐字一欄**，換行才只發生在字與字之間，不會把某一欄的讀音跟本文拆散。
 * 用 `[...text]` 而不是 `split('')`：後者會把一個字佔兩個碼元的漢字切成兩半。
 */
export function termColumns(text: string, showReading: boolean): TermColumn[] {
  if (!showReading) return [...toPlainText(text)].map((char) => ({ base: char }));

  return parseReading(text).flatMap((segment) =>
    segment.reading === undefined
      ? [...segment.text].map((char) => ({ base: char }))
      : [{ base: segment.text, reading: segment.reading }],
  );
}
