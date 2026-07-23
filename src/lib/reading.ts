/**
 * 讀音標記：把 `焦[こ]がす` 這種寫法解析成可渲染的振假名結構。
 * 純函式，不涉及任何狀態。
 */

/** 詞條中的一段文字，有 reading 者代表該段漢字要標振假名。 */
export interface Segment {
  text: string;
  reading?: string;
}

/** 漢字（含擴充 A 區與疊字符號々）。方括號前緊鄰的漢字序列才是被標注對象。 */
const KANJI = /[㐀-䶿一-鿿々]/;

export function parseReading(text: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) segments.push({ text: buffer });
    buffer = '';
  };

  while (i < text.length) {
    const char = text[i]!;
    if (char !== '[') {
      buffer += char;
      i += 1;
      continue;
    }

    const close = text.indexOf(']', i);
    if (close === -1) {
      // 未閉合的方括號，原樣保留
      buffer += text.slice(i);
      break;
    }

    // 往回吃掉緊鄰括號的漢字序列
    let start = buffer.length;
    while (start > 0 && KANJI.test(buffer[start - 1]!)) start -= 1;
    const base = buffer.slice(start);

    if (base) {
      buffer = buffer.slice(0, start);
      flush();
      segments.push({ text: base, reading: text.slice(i + 1, close) });
    } else {
      // 括號前沒有漢字，不成立為讀音標記，原樣保留
      buffer += text.slice(i, close + 1);
    }
    i = close + 1;
  }

  flush();
  return segments;
}

/** 去掉讀音標記後的詞條原文，用於卡片正面與搜尋。 */
export function toPlainText(text: string): string {
  return parseReading(text)
    .map((segment) => segment.text)
    .join('');
}

/** 把漢字換成標注的讀音，用於語音朗讀，確保聽到的與卡片教的讀法一致。 */
export function toReadingText(text: string): string {
  return parseReading(text)
    .map((segment) => segment.reading ?? segment.text)
    .join('');
}
