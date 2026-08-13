import { describe, it, expect } from 'vitest';
import context from '../../CONTEXT.md?raw';
import glossary from '../../docs/glossary.md?raw';

/**
 * `CONTEXT.md` 的詞彙條目與 `docs/glossary.md` 的三語對照表是兩份檔，
 * 沒有東西阻止它們漂移。這支測試釘住的是**條目清單本身**：
 * 多一條、少一條、順序不同都紅燈。
 *
 * 釘不住的三件事（見 `.scratch/i18n/spec.md` 決定一），是人的責任、不要往這裡加：
 *   1. 譯名寫錯（名字清單還是對的，照樣綠燈）
 *   2. 定義改了譯名沒跟（改的是標題底下的段落，標題沒動）
 *   3. `_Avoid_` 更新了譯名沒跟（同上）
 *
 * 失敗訊息必須指得出是哪一條——紅燈了還要自己去翻檔案找，這道守門就白做了。
 */

/**
 * 條目標題長這樣：`**單字本（Vocabulary Book）**：` 獨占一行。
 * 括號裡的英文只是行文方便，對照表的第一欄是純中文，因此比對前先剝掉。
 */
function namesInContext(source: string): string[] {
  return [...source.matchAll(/^\*\*(.+?)\*\*：/gm)].map((m) => m[1].replace(/（.*）$/, ''));
}

/**
 * 對照表的第一欄。表頭與分隔列（`| --- |`）不是條目，跳掉。
 */
function namesInGlossary(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1].trim())
    .filter((name) => name !== '中文' && !/^-+$/.test(name));
}

/**
 * 兩邊都抽不到就會一起是空的，那是假綠燈。
 * 而且「抓不到」與「對不上」是兩回事：前者代表檔案格式被改過，後者才是譯名漏跟。
 */
function requireNonEmpty(names: string[], file: string, how: string): string[] {
  if (names.length === 0) {
    throw new Error(`${file} 一則條目都抽不到，該檔的${how}可能改過了，請一併更新這支測試的抽取規則`);
  }
  return names;
}

describe('CONTEXT.md 與 docs/glossary.md 的條目清單一致', () => {
  const inContext = requireNonEmpty(namesInContext(context), 'CONTEXT.md', '條目標題格式（`**名字**：` 獨占一行）');
  const inGlossary = requireNonEmpty(namesInGlossary(glossary), 'docs/glossary.md', '表格格式');

  it('CONTEXT.md 的條目在對照表裡都有', () => {
    const missing = inContext.filter((name) => !inGlossary.includes(name));
    expect(missing, `這 ${missing.length} 則在 CONTEXT.md 有、docs/glossary.md 沒有：${missing.join('、')}`).toEqual(
      [],
    );
  });

  it('對照表沒有多出 CONTEXT.md 以外的條目', () => {
    const extra = inGlossary.filter((name) => !inContext.includes(name));
    expect(extra, `這 ${extra.length} 則在 docs/glossary.md 有、CONTEXT.md 沒有：${extra.join('、')}`).toEqual([]);
  });

  it('兩邊的條目順序一致', () => {
    const at = inContext.findIndex((name, i) => name !== inGlossary[i]);
    expect(
      at,
      `第 ${at + 1} 則對不上：CONTEXT.md 是「${inContext[at]}」，` +
        `docs/glossary.md 是「${inGlossary[at] ?? '沒有這一列'}」。` +
        `並排好查靠的就是順序一樣，請把對照表那一列搬到對的位置`,
    ).toBe(-1);
  });
});
