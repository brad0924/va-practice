/**
 * 掃原始碼、抓出 import 來源、換算成套件名（票 `12`）。
 *
 * 為什麼要有這一支：同一類問題在這條線上炸過兩次（票 `05` 的 `@babel/runtime`、
 * 票 `06` 的 `vitest`），兩次都是**本機怎麼跑都是綠的**。找套件的規矩是從用它的那個檔
 * 往上層走，開發機的 repo 根自己有一份 `node_modules` 剛好接住；CI 那邊根目錄是空的才炸。
 * 人不會自己想到要檢查一件在自己機器上永遠不會響的事，所以讓機器來查。
 *
 * **它擋不住什麼**：票 `05` 那次抓不到。去叫 `@babel/runtime` 的不是原始碼，是 babel
 * 轉譯後產生的程式碼——原始碼裡根本沒有那一行 import，掃原始碼再仔細也看不到。
 * 這一支擋的是**人寫錯 import**，不是**工具鏈偷偷帶進來的東西**。
 *
 * 本檔不碰檔案系統，走檔案樹與比對 `package.json` 的部分在 `dependency-guard.test.ts`。
 */

/** 一筆掃到的相依：哪支檔、原始寫法、換算出來的套件名。 */
export type ImportSite = {
  file: string;
  /** 原始碼裡的那個字串，含子路徑，例如 `react-native-screens/experimental`。 */
  source: string;
  /** 拿去 `package.json` 查的那一段，例如 `react-native-screens`。 */
  packageName: string;
};

/** 一支待掃的檔：相對 `mobile/` 的路徑，加上整支的原始碼文字。 */
export type SourceFile = {
  file: string;
  code: string;
};

/**
 * 剝掉 `//` 與 `/* *\/` 註解，字串內容原樣留著。
 *
 * 為什麼非剝不可：`mobile/` 底下有六支檔的**註解裡**寫著 `from 'vitest'`，而 `vitest`
 * 沒有裝在這裡。不剝的話這支檢查上線第一天就有六條誤報。
 *
 * 認得單引號、雙引號、反引號三種字串與其中的 `\` 跳脫。**它只是個小掃描器，不是
 * JavaScript 剖析器**，所以有兩種寫法會讓它把引號讀錯邊：
 *
 * - **JSX 純文字裡的單引號**，像 `<Text>don't</Text>`。那個 `'` 會被當成字串開頭。
 * - **regex 字面量裡的引號**，像 `/it's/`。同一個坑。
 *
 * `mobile/` 現在兩種都沒有。真的要寫時，前者換成 `{"don't"}`、後者換成 `new RegExp('…')`
 * 就繞開了。
 *
 * **踩到了會怎樣：多報，不會漏報。** 字串內容是原樣抄出去的，所以讀錯邊只會讓那一段裡的
 * 註解沒被剝掉，真的 import 一條都不會消失。也就是說失手的方向是紅燈太大聲，
 * 而不是綠燈騙人——那正是這支檢查最不能出的錯。
 */
export function stripComments(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const pair = code.slice(i, i + 2);
    if (pair === '//') {
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }
    if (pair === '/*') {
      i += 2;
      while (i < code.length && code.slice(i, i + 2) !== '*/') i += 1;
      i += 2;
      // 留一個空白，免得剝完把左右兩個字黏成一個。
      out += ' ';
      continue;
    }
    const char = code[i];
    if (char === "'" || char === '"' || char === '`') {
      // 進到字串裡，一路抄到同一種引號收尾為止。
      const quote = char;
      out += quote;
      i += 1;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          out += code[i];
          i += 1;
        }
        if (i < code.length) {
          out += code[i];
          i += 1;
        }
      }
      out += code[i] ?? '';
      i += 1;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

/**
 * 四種寫法各一條，都要抓：
 * - `from '…'`（含 `import type`、`export … from`）
 * - `import '…'`（只為了副作用，沒有具名匯入）
 * - `require('…')`（設定檔用的是這種——`metro.config.js` 那行 `require('expo/metro-config')`
 *   只有這條認得出來）
 * - `import('…')`（動態載入）
 *
 * **`#import "…"` 不算。** 那是 Objective-C，永遠不會是 JavaScript 的 import。
 * 這個 repo 真的有一支檔在字串裡放著那種寫法——`plugins/with-app-check-first.js`
 * 要往 bridging header 寫 `#import "RNFBAppCheckModule.h"`（票 `16`）。
 * 少了那個 `#` 的排除，它會被報成「import 了一個叫 `RNFBAppCheckModule.h` 的套件」。
 */
const SOURCE_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  // 前面那一格排除 `#`：`\b` 認得 `#` 與 `i` 之間有分界，光靠它擋不掉 `#import`。
  /(?<!#)\bimport\s+['"]([^'"]+)['"]/g,
  /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** 抓出一支檔裡所有 import 來源，照原始碼出現的先後排。註解裡的不算。 */
export function collectModuleSources(code: string): string[] {
  const stripped = stripComments(code);
  const found: Array<{ at: number; source: string }> = [];
  for (const pattern of SOURCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(stripped);
    while (match !== null) {
      found.push({ at: match.index, source: match[1] });
      match = pattern.exec(stripped);
    }
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.source);
}

/**
 * 把 import 來源換算成要拿去 `package.json` 查的套件名。查不到東西可查時回 `null`。
 *
 * 三類直接跳過（各佔多少、當初怎麼數的，見票 `12`）：
 * - 相對路徑：那是檔案不是套件。
 * - `@core/*`：`tsconfig`／`metro.config`／`jest.config` 三邊各設一次的路徑別名，
 *   **不是套件**，查了必定紅燈。
 * - `node:*`：Node 內建模組。
 */
export function packageNameOf(source: string): string | null {
  if (source.startsWith('.')) return null;
  if (source.startsWith('@core/')) return null;
  if (source.startsWith('node:')) return null;
  const segments = source.split('/');
  // npm 的 scoped 套件名佔兩段（`@testing-library/react-native`），其餘只佔第一段。
  return source.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

/**
 * 逐支檔比對，把「原始碼裡 import 了、`declared` 裡卻沒有」的挑出來。
 *
 * 同一支檔漏同一個套件只報一次——同一個名字在一支檔裡出現三次，講一次就夠了。
 */
export function findMissingDependencies(
  files: ReadonlyArray<SourceFile>,
  declared: ReadonlySet<string>,
): ImportSite[] {
  const missing: ImportSite[] = [];
  for (const { file, code } of files) {
    const reported = new Set<string>();
    for (const source of collectModuleSources(code)) {
      const packageName = packageNameOf(source);
      if (packageName === null) continue;
      if (declared.has(packageName)) continue;
      if (reported.has(packageName)) continue;
      reported.add(packageName);
      missing.push({ file, source, packageName });
    }
  }
  return missing;
}
