import { createNativeSaveFile } from '../lib/download-native';

/** 建立元素的簡寫。文字一律走 textContent／文字節點，不經過 HTML 解析。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children.length > 0) node.append(...children);
  return node;
}

export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/**
 * 把一段內容交到使用者手上。呼叫端不必知道自己跑在哪裡：
 * 原生殼裡有自己的存檔手段（iOS 是分享單），拿不到就走瀏覽器的老招數——
 * 借一個隱形連結按下去。
 *
 * 失敗的話用丟的，讓呼叫端決定怎麼講——它才有畫面可以寫。
 * 使用者在分享單上按取消不算失敗，那件事在 `download-native.ts` 就吞掉了。
 *
 * 隱形連結那條路**永遠不會丟**：按下去之後成敗如何，瀏覽器不告訴任何人。
 * 因此網頁版實際上走不到呼叫端的錯誤處理，回傳 Promise 只是為了讓兩條路同一個形狀。
 */
export async function download(content: string, filename: string, type: string): Promise<void> {
  const saveNatively = createNativeSaveFile();
  if (saveNatively) {
    await saveNatively(content, filename);
    return;
  }

  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
