/**
 * 註解裡的指路壞掉時把 commit 擋下來。`scripts/hooks/commit-msg` 從這裡拿判斷，自己不另外寫
 * 一份，形狀比照 `privacy-signals.mjs`。決策見 .scratch/rn-rewrite/issues/23。
 *
 * **問題不是「找出所有檔名」，是「分辨意圖」。** 註解裡出現一個不存在的檔名，可能是壞掉的指路
 * （「見 `x`」，讀的人會撲空），也可能是刻意的講古（「票 `18` 之前掛的是 `x`」，寫的人本來就
 * 知道它不在）。票 `22` 收尾時實測過：整個 repo 掃出 29 個這種字串，27 個是講古，只有 2 個
 * 真的壞了。單看「檔在不在」的守門會叫錯 27 次才叫對 2 次，而讓大家為了讓它閉嘴去刪講古的
 * 句子，比不裝還糟。
 *
 * **因此不去猜，改成兩種寫法。** 講古繼續用反引號（`` `x` ``），這裡一眼都不看；指路改寫成
 * Markdown 連結（`[說明](../x.ts)`），只有這一種會被檢查。分辨的工作在下筆的時候就做完了。
 * 這條分界線也是 Rust（intra-doc link）、C#（`<see cref>`）、Javadoc（`{@link}`）共通的做法：
 * code span 沒人管，連結才受檢。
 *
 * **為什麼是 Markdown 連結而不是 `{@link}`。** `{@link}` 認的是程式符號，不是檔案路徑——實測
 * TypeScript 5.9.3 與 6.0.3，`{@link ./x.ts}` 一律解析不出來，編輯器裡是死文字。而這件事要指的
 * 兩種目標剛好都沒有符號可指：一個是目錄（`app/data/`），一個是零 export 的副作用模組
 * （`lib/install-crypto.ts`）。Markdown 連結兩邊都活：`.md` 在 GitHub 上點得下去，`.ts` 的 JSDoc
 * 被 VS Code 當 Markdown 排版，而它會把當前檔案的位置設成 `baseUri`（見其 `typescript-language-features`
 * 的 hover provider），相對路徑因此解得開。**兩邊的基準都是「這支檔自己的目錄」**，`resolveTarget`
 * 照的就是這一條。
 *
 * **掃整個工作目錄，不是只掃這次改的東西。** 這道守門要防的那件事，兩端天生不在同一次改動裡：
 * 票 `21` 刪掉的是 `ios/` 與 `src/lib/`，壞掉的卻是 `mobile/` 底下十六行沒被碰過的註解。只看
 * diff 的話那十六行永遠不會進到視野。代價是別人留下的紅燈會擋到你，出口是 commit message 裡
 * 的 `MARKER`。
 *
 * **已知缺口：指進 `node_modules/` 的連結會過關，但那是假的。** 本機裝了套件就查得到，全新
 * clone 在 `npm install` 之前查不到。`mobile/lib/share-file-native.ts` 有兩處提到套件內部的檔，
 * 那兩處刻意留成反引號——套件內部不是版控裡的東西，寫成連結等於承諾一件這個 repo 管不到的事。
 * 目前零個實例，所以不為它多寫一條規則，只記在這裡。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

/** 掃這四個。`.scratch/` 不在裡面——那裡是票與 spec，整片都是講古，而且它們自己不會被刪。 */
export const SCANNED_ROOTS = ['mobile', 'src', 'core', 'docs'];

/** commit message 裡寫這個標記加一句理由，就能過這一關。 */
export const MARKER = 'Links-checked:';

/** 掃得出指路的就這幾種。其餘（圖檔、`.json`、`.swift`）裡面不會有給人讀的說明。 */
const SCANNED_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs|md)$/;

/**
 * 掃到就一定誤報的地方，跟 `privacy-signals.mjs` 的 `UNWATCHED` 同一個立場：預設是掃，例外才
 * 列出來。`ios/`／`android/` 是原生工具產的殼，`.expo/` 與 `dist/` 是建置產物——那些目錄裡的
 * 東西沒有人手寫，也沒有人會照著它去找檔。
 */
const SKIPPED_DIRECTORIES = /(?:^|\/)(?:node_modules|ios|android|\.expo|dist|coverage|build)(?:\/|$)/;

/** git 一律吐正斜線，Windows 的 API 吐反斜線，統一成 repo 相對的正斜線寫法。 */
export function normalize(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** 這支檔要不要掃。 */
export function scans(file) {
  const path = normalize(file);
  if (!SCANNED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))) return false;
  if (SKIPPED_DIRECTORIES.test(path)) return false;
  return SCANNED_EXTENSIONS.test(path);
}

/**
 * 程式碼檔裡，這一行是不是註解。
 *
 * **非這樣過濾不可。** `mobile/test/import-scan.ts` 裡有 `/\bfrom\s*['"]([^'"]+)['"]/g` 這種
 * 正規表示式，字面上剛好符合 `[…](…)`——不擋掉的話，守門一上線就會對三行完全正常的程式碼叫。
 * 而指路本來就只寫在給人讀的地方，所以限定註解不但擋得掉誤報，也沒有漏掉任何該管的。
 *
 * 判斷用「這一行開頭長什麼樣」，不做真正的語法剖析。會漏的是「程式碼後面接的尾註解」
 * （`foo(); // 見 [x](./y.ts)`）——那種寫法這個 repo 一次都沒有，而多做一層剖析換不到相稱的東西。
 */
export function isComment(line) {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}

/** `.md` 整份都是給人讀的，`.ts` 那些只有註解行算數。 */
function readableLines(file, text) {
  const isMarkdown = normalize(file).endsWith('.md');
  return text.split('\n').map((content, index) => ({
    line: index + 1,
    content: isMarkdown || isComment(content) ? content : '',
  }));
}

/** 指到 repo 以外的東西，不是這道守門管得動的。 */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

/**
 * 抓出一段文字裡所有的指路連結。回傳寫在括號裡的原文（`target`）與方括號裡的說明（`label`）。
 *
 * 三種不算指路，一律跳過：外部網址（`https:`、`mailto:`）、同一份文件裡的錨點（`#…`），
 * 以及協定相對網址（`//…`）。路徑後面掛的錨點與 Markdown 的標題參數要切掉——
 * `[設定](./a.ts#L20)` 要檢查的是 `./a.ts`。
 */
export function linksIn(file, text) {
  const path = normalize(file);
  return readableLines(file, text).flatMap(({ line, content }) =>
    [...content.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].flatMap((match) => {
      const label = match[1];
      const target = match[2].replace(/#.*$/, '');
      if (target === '' || EXTERNAL.test(match[2])) return [];
      return [{ file: path, line, target, label }];
    }),
  );
}

/**
 * 算出連結實際指到哪裡，結果是 repo 相對路徑。
 *
 * 基準是**這支檔自己的目錄**，因為 VS Code 的 hover 與 GitHub 的 markdown 都是這樣解的。
 * 自己另訂一套（例如「從 repo 根算」）的話，守門說得通、點下去卻跳到別的地方，那比沒有守門更糟。
 */
export function resolveTarget(file, target) {
  const parts = normalize(file).split('/').slice(0, -1);
  for (const step of target.replace(/\/+$/, '').split('/')) {
    if (step === '' || step === '.') continue;
    if (step === '..') {
      // 已經在根上還往上走，就留著 `..` 讓路徑自己說明它出界了。
      if (parts.length === 0 || parts.at(-1) === '..') parts.push('..');
      else parts.pop();
      continue;
    }
    parts.push(step);
  }
  return parts.join('/');
}

/** 掃一段文字，回傳指不到的那些。目標在不在由 `exists` 遞進來，測試才不必動磁碟。 */
export function danglingIn(file, text, exists) {
  if (!scans(file)) return [];
  return linksIn(file, text).flatMap((link) => {
    const resolved = resolveTarget(link.file, link.target);
    return exists(resolved) ? [] : [{ ...link, resolved }];
  });
}

/** 走訪與讀檔都從這裡進出，測試遞一份假的進來就能整條走完。 */
const nodeIo = {
  list: (dir) => readdirSync(dir === '' ? '.' : dir),
  isDir: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  read: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
};

/** 把四個範圍走一遍，回傳所有指不到的連結。 */
export function collect(io = nodeIo) {
  const hits = [];
  const walk = (dir) => {
    for (const name of io.list(dir)) {
      const path = dir === '' ? name : `${dir}/${name}`;
      if (SKIPPED_DIRECTORIES.test(path)) continue;
      if (io.isDir(path)) walk(path);
      else if (scans(path)) hits.push(...danglingIn(path, io.read(path), io.exists));
    }
  };
  for (const root of SCANNED_ROOTS) {
    if (io.exists(root)) walk(root);
  }
  return hits;
}

/**
 * git 會把說明用的 `#` 開頭那幾行一起塞在 message 檔裡，那些不算數；標記後面沒接理由也不算
 * ——這道關卡逼的就是「停下來想一秒」。與 `privacy-signals.mjs` 的同名函式是同一個判斷，
 * 兩邊各留一份是刻意的：兩道關卡的標記不同，共用會讓其中一邊的標記悄悄能過另一邊。
 */
export function hasMarker(message) {
  const marker = new RegExp(`^${MARKER}\\s*\\S`);
  return message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .some((line) => marker.test(line.trim()));
}

/** 座標、寫的路徑、算出來的目標三樣都印——少了最後一樣，看的人得自己在腦子裡做路徑運算。 */
export function describeHits(hits) {
  return hits
    .map((hit) => `  ${hit.file}:${hit.line}  [${hit.label}](${hit.target}) → 找不到 ${hit.resolved}`)
    .join('\n');
}
