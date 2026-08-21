/**
 * 兩份隱私權政策（`public/privacy.html`、`public/privacy-en.html`）寫的每一句都綁在程式的實際
 * 行為上。行為改了、兩份沒跟，政策就開始說謊——而說謊不會有人回報。這個檔是兩道提醒 hook
 * 的共同大腦：`scripts/hooks/commit-msg`（擋 commit）與 `scripts/hooks/privacy-notice.mjs`
 * （提醒 agent）都只從這裡拿判斷，自己不另外寫一份。決策見 .scratch/i18n/issues/11。
 *
 * **不按檔名清單，按改動的內容。** 初版計畫是盯死 cloud-backup／cloud-crypto／gemini-key／
 * gemini-reading 四支，但 commit 2b96a9a 新增的 keychain.ts 與 keychain-native.ts 就不在那份
 * 清單裡，政策裡三句話因此失準而沒有任何東西攔下來。清單的病是遞迴的：要靠人記得維護清單，
 * 而「記得維護清單」本身也要靠人記得。改成看內容之後，涵蓋範圍是整個 repo。
 *
 * 這張網有洞，而且是刻意收下的（票 11 的「已知缺口」列了六個）。最大的一個是「改動不含訊號
 * 就抓不到」——例如在送出的欄位裡多塞一個，那一行可能一個關鍵字都沒有。要補得追整條呼叫鏈
 * 做靜態分析，成本跟這件事的份量完全不成比例。
 */

/**
 * 隱私相關的本質只有兩件事：**資料離開裝置**，或**資料落地保存**。這兩件事在程式碼裡都留得下痕跡。
 *
 * 方向是刻意偏寬的：誤報的代價是「多看一眼」，漏報的代價是政策說謊。這個 repo 的語言設定、
 * 每日提醒、Gemini 金鑰都用 localStorage，改那些也會跳，那是划算的交換。
 *
 * **最後那一條聞的是名字，不是網址。** 前面幾條都假設「送出去」在程式碼裡看得見——寫死一個
 * 網址、按下 `fetch(`。iOS 的讀音預填改走 Firebase AI Logic 之後那個假設就破了：請求由 SDK
 * 送出，程式碼裡從頭到尾一個網址字串都沒有。實測 `fixed-gemini-key` 那一系列，三個 commit 零
 * 命中，其中 `d3d4077` 還替裝置多帶進一組註冊到 Google 的識別碼（見測試裡的第二道考題）。
 * 因此 import 路徑本身就當訊號——寫得下 `firebase/ai`、`firebase/remote-config`、
 * `@capacitor-firebase/app-check` 這種一行，就代表有東西要跟 Google 往來。
 *
 * 兩種寫法都要認：JS 那側是帶斜線的模組路徑，原生那側沒有斜線（`AppDelegate.swift` 裡是
 * `import FirebaseCore`），而 App Attest 正是在那支檔裡指定的。只認斜線會漏掉整個 `ios/`。
 *
 * `pattern` 一律不加 `g` 旗標——帶 `g` 的 RegExp 的 `test()` 會記住上次比到哪裡，
 * 同一個物件重複用在多行上會時準時不準。
 */
export const PRIVACY_SIGNALS = [
  { name: 'fetch(', pattern: /\bfetch\s*\(/, means: '資料送出去' },
  { name: 'localStorage／sessionStorage', pattern: /\b(?:localStorage|sessionStorage)\b/, means: '資料落地' },
  { name: 'Keychain／Filesystem／Preferences', pattern: /\b(?:Keychain|Filesystem|Preferences)\b/, means: '原生那一側落地' },
  { name: 'crypto.subtle', pattern: /\bcrypto\.subtle/, means: '加解密，政策整節在講這個' },
  { name: 'firebasedatabase／generativelanguage', pattern: /firebasedatabase|generativelanguage/, means: '兩個實際的外送目標' },
  { name: 'firebase/*、Firebase*', pattern: /\bfirebase\/[a-z-]+|\bFirebase[A-Z]/, means: '第三個外送目標' },
];

/** 改了其中任何一份就代表「已經去看過了」，兩道 hook 一律放行。 */
export const PRIVACY_PAGES = ['public/privacy.html', 'public/privacy-en.html'];

/** commit message 裡寫這個標記加一句理由，就能過 `commit-msg` 那一關。 */
export const MARKER = 'Privacy-checked:';

/**
 * 預設是「掃」，例外才列出來——反過來寫成白名單的話，新長出來的目錄會默默不在守備範圍內，
 * 那又回到檔名清單那個病。這裡的三條例外都不是「這裡不會有隱私問題」，是「掃了必定誤報」：
 *
 *   - 兩份 privacy 自己：它們是這件事的**目標**，不是觸發源。改了它們反而該放行。
 *   - `scripts/hooks/`：上面那份清單本身就寫滿了每一個訊號，掃自己等於每次都跳。
 *   - markdown：文件是在**描述**行為，不是行為。`.scratch/` 底下二十幾份票都提到 localStorage，
 *     而改一份票不可能改到程式的行為。真正的行為改動一定會同時動到程式碼，那邊照樣掃得到。
 *   - repo 以外：agent 常在暫存目錄裡寫拋棄式腳本，那些不會變成這個 app 的行為。
 *     兩種寫法都要擋——Windows 上跨磁碟機時算不出相對路徑，回來的會是 `D:/…` 這種絕對路徑。
 */
const UNWATCHED = [
  /^public\/privacy(?:-[\w-]+)?\.html$/,
  /^scripts\/hooks\//,
  /\.md$/,
  /^\.\.\//,
  /^(?:[a-zA-Z]:)?\//,
];

/** git 一律吐正斜線，Claude Code hook 遞過來的是 Windows 絕對路徑，統一成 repo 相對的正斜線寫法。 */
export function normalize(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** 這個路徑要不要掃。 */
export function watches(file) {
  const path = normalize(file);
  return !UNWATCHED.some((unwatched) => unwatched.test(path));
}

/**
 * 掃一段文字，回傳命中清單。行號預設從 1 起算；`startsAt` 是給 diff 用的，
 * 那邊每一行都知道自己在檔案裡的真實位置。
 *
 * 一行同時命中兩個訊號就回兩筆，不去重——那代表這一行牽涉兩件不同的事，兩件都該被看到。
 */
export function hitsIn(file, text, { startsAt = 1, side = '+' } = {}) {
  if (!watches(file)) return [];

  const path = normalize(file);
  return text.split('\n').flatMap((content, index) =>
    PRIVACY_SIGNALS.filter(({ pattern }) => pattern.test(content)).map(({ name, means }) => ({
      file: path,
      line: startsAt + index,
      side,
      signal: name,
      means,
      content: content.trim(),
    })),
  );
}

/**
 * 拆 unified diff。回傳這次碰到的所有檔（含不掃的，`blockingHits` 要靠它認出 privacy 有沒有被改），
 * 以及每一個改動行在自己那一側檔案裡的行號。
 *
 * **新增與刪除的行都算改動。** 只看新增的話，「把整個功能砍掉」會整個漏掉——那正是政策開始
 * 說謊的典型場景：功能沒了，政策那一節還在描述它。刪除行的行號是舊檔的行號，所以命中清單要
 * 帶著 `+`／`-` 一起印，否則座標會指到不相干的地方。
 *
 * 檔頭只在 `@@` 之前認。**內文行本身可能長得像檔頭**：刪掉一行 `-- 註解`，在 diff 裡就是
 * `--- 註解`。當成檔頭跳過的話，後面每一行的行號都少一；`+++` 那側更糟，會把座標整個換到一個
 * 不存在的檔上。
 *
 * 認不出來的兩種：純改名與只改權限，git 不吐 `+++` 行（也真的沒有內容變動可掃）；
 * merge commit 的 combined diff 用的是 `@@@`，`git diff --cached` 產不出那種，只有 `git show`
 * 一個 merge 才會。
 */
function parse(diff) {
  const files = [];
  const changes = [];
  let file = null;
  let inHunk = false;
  let removedFrom = null;
  let oldLine = 0;
  let newLine = 0;

  /** `--- a/x`／`+++ b/x` 的路徑；`/dev/null` 代表那一側沒有這個檔。 */
  const named = (line) => {
    const path = line.slice(4).replace(/^[ab]\//, '').replace(/\t.*$/, '');
    return path === '/dev/null' ? null : normalize(path);
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // `git show` 的訊息本文也長得像內文行，沒認到檔頭之前一律不收。
      file = null;
      inHunk = false;
      removedFrom = null;
      continue;
    }
    if (!inHunk && line.startsWith('--- ')) {
      removedFrom = named(line);
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      // 整支檔被刪掉時新檔名是 `/dev/null`，座標只能落在舊檔名上——那正是最該擋的那一種改動。
      file = named(line) ?? removedFrom;
      if (file !== null) files.push(file);
      continue;
    }

    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk !== null) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (file === null || !inHunk) continue;

    if (line.startsWith('+')) {
      changes.push({ file, line: newLine, side: '+', text: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith('-')) {
      changes.push({ file, line: oldLine, side: '-', text: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { files, changes };
}

function scan({ changes }) {
  return changes.flatMap(({ file, line, side, text }) => hitsIn(file, text, { startsAt: line, side }));
}

/** 掃一份 unified diff。 */
export function hitsInDiff(diff) {
  return scan(parse(diff));
}

/**
 * 這次 commit 該不該被擋。回傳要印出來的命中清單，空陣列代表放行。
 *
 * 兩條出口：去改那兩份 privacy，或在 commit message 裡寫一行理由。後者擋不住「隨便寫一句就過」，
 * 那是刻意的——擋得更死會養出用 `--no-verify` 繞過的習慣，那時整道防護等於零，而且無人察覺。
 */
export function blockingHits(diff, message) {
  const hits = hitsInDiff(diff);
  if (hits.length === 0) return [];

  const { files } = parse(diff);
  if (files.some((file) => PRIVACY_PAGES.includes(file))) return [];
  if (hasMarker(message)) return [];

  return hits;
}

/**
 * git 會把說明用的 `#` 開頭那幾行一起塞在 message 檔裡，那些不算數；
 * 標記後面沒接理由也不算——這道關卡逼的就是「停下來想一秒」，只貼一個標記等於沒想。
 */
export function hasMarker(message) {
  const marker = new RegExp(`^${MARKER}\\s*\\S`);
  return message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .some((line) => marker.test(line.trim()));
}

/** 兩道 hook 的訊息長得一樣，紅燈時看到的東西才不會因為是誰跳的而不同。 */
export function describeHits(hits) {
  return hits.map((hit) => `  ${hit.side} ${hit.file}:${hit.line}  ${hit.signal}（${hit.means}）`).join('\n');
}
