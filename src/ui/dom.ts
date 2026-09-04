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
 * 把一段內容交到使用者手上：借一個隱形連結按下去，瀏覽器的老招數。
 *
 * 這條路**永遠不會丟**：按下去之後成敗如何，瀏覽器不告訴任何人。
 * 因此呼叫端的錯誤處理實際上走不到，回傳 Promise 只是為了讓呼叫端不必分辨。
 */
export async function download(content: string, filename: string, type: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
