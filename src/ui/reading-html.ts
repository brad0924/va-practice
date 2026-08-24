import { parseReading, toPlainText } from '@core/lib/reading';

/**
 * 把詞條渲染成 DOM。showReading 為 false 時只顯示原文，
 * 漢字不標讀音——卡片正面就是靠這點來測驗讀法的。
 *
 * 一律以 DOM API 建立節點，使用者輸入的內容不會被當成 HTML 解析。
 */
export function renderTerm(text: string, showReading: boolean): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!showReading) {
    fragment.append(toPlainText(text));
    return fragment;
  }

  for (const segment of parseReading(text)) {
    if (segment.reading === undefined) {
      fragment.append(segment.text);
      continue;
    }
    const ruby = document.createElement('ruby');
    ruby.append(segment.text);
    const rt = document.createElement('rt');
    rt.textContent = segment.reading;
    ruby.append(rt);
    fragment.append(ruby);
  }
  return fragment;
}
