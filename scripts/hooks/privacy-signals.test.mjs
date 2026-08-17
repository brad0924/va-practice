import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PRIVACY_SIGNALS, watches, hitsIn, hitsInDiff, blockingHits } from './privacy-signals.mjs';

/**
 * 這兩道 hook 守的是「兩份 privacy 開始說謊」，而說謊不會有人回報——沒有使用者會來說
 * 「你們的隱私權政策跟程式對不上」。所以這支測試守的不是 hook 會不會壞，是它會不會**變安靜**。
 *
 * 最重要的一條是下面那個「考題」：把真的漏過去的那次 commit 重放一次。
 */

/** 湊一段 unified diff。手寫 `@@` 很容易數錯行數，讓它自己算。 */
function diffOf(file, lines, { startsAt = 1 } = {}) {
  const added = lines.filter((line) => !line.startsWith('-')).length;
  const removed = lines.filter((line) => !line.startsWith('+')).length;
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${startsAt},${removed} +${startsAt},${added} @@`,
    ...lines,
  ].join('\n');
}

describe('訊號清單', () => {
  it('每個訊號都講得出它代表什麼', () => {
    expect(PRIVACY_SIGNALS.length).toBeGreaterThan(0);
    for (const signal of PRIVACY_SIGNALS) {
      expect(signal.means, `訊號 ${signal.pattern} 沒寫 means`).toBeTruthy();
    }
  });

  /**
   * 決定一：清單只有一份。兩道 hook 各自複製一份就會漂移，而漂移正是這張票在對付的病。
   * 「有沒有 import」擋得住整份複製過去，擋不住偷加一條——所以連 `localStorage` 這種
   * 明顯是訊號的字串，也不准出現在 hook 腳本裡。
   */
  it('兩道 hook 都 import 這份清單，而且自己不另外寫訊號', () => {
    for (const hook of ['scripts/hooks/commit-msg', 'scripts/hooks/privacy-notice.mjs']) {
      const source = readFileSync(hook, 'utf8');
      expect(source, `${hook} 沒有 import privacy-signals.mjs`).toContain('privacy-signals.mjs');

      const own = PRIVACY_SIGNALS.filter(({ pattern }) => pattern.test(source));
      expect(
        own.map(({ pattern }) => String(pattern)),
        `${hook} 裡自己寫了訊號，那份會跟 privacy-signals.mjs 漂移。請改成 import`,
      ).toEqual([]);
    }
  });
});

describe('哪些檔要掃', () => {
  it('程式碼要掃，不分目錄', () => {
    for (const file of ['src/lib/cloud-backup.ts', 'src/main.ts', 'ios/App/App/KeychainPlugin.swift']) {
      expect(watches(file), `${file} 應該要掃`).toBe(true);
    }
  });

  it('兩份 privacy 自己不掃：它們是目標，不是觸發源', () => {
    expect(watches('public/privacy.html')).toBe(false);
    expect(watches('public/privacy-en.html')).toBe(false);
  });

  it('hook 自己不掃：訊號清單裡本來就寫滿了每一個訊號', () => {
    expect(watches('scripts/hooks/privacy-signals.mjs')).toBe(false);
    expect(watches('scripts/hooks/commit-msg')).toBe(false);
  });

  it('markdown 不掃：文件只是在描述行為，本身不是行為', () => {
    expect(watches('.scratch/i18n/spec.md')).toBe(false);
    expect(watches('CONTEXT.md')).toBe(false);
  });

  it('repo 以外的檔不掃：agent 在暫存目錄裡寫的東西不會變成 app 的行為', () => {
    expect(watches('../../tmp/scratch/probe.ts')).toBe(false);
    // Windows 跨磁碟機時算不出相對路徑，回來的是絕對路徑。
    expect(watches('D:/temp/scratch/probe.ts')).toBe(false);
    expect(watches('/tmp/scratch/probe.ts')).toBe(false);
  });
});

describe('掃一段文字', () => {
  it('指得出命中哪個訊號、在第幾行', () => {
    const hits = hitsIn('src/lib/x.ts', ['const a = 1;', 'await fetch(url);'].join('\n'));
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(2);
    expect(hits[0].means).toBeTruthy();
  });

  it('prefetch 不是 fetch', () => {
    expect(hitsIn('src/lib/x.ts', 'prefetch(url);')).toEqual([]);
  });

  it('不含訊號的改動完全不出聲', () => {
    expect(hitsIn('src/ui/list-view.ts', "button.textContent = '刪除這張卡';")).toEqual([]);
  });
});

describe('掃一份 diff', () => {
  it('只看改動的行，沒動到的那些不算', () => {
    const diff = diffOf('src/lib/x.ts', [' const key = localStorage.getItem(K);', '+const b = 2;']);
    expect(hitsInDiff(diff)).toEqual([]);
  });

  it('新增的行命中，行號跟著 @@ 走', () => {
    const diff = diffOf('src/lib/x.ts', [' const a = 1;', '+localStorage.setItem(K, v);'], { startsAt: 40 });
    const hits = hitsInDiff(diff);
    expect(hits).toHaveLength(1);
    expect(`${hits[0].file}:${hits[0].line}`).toBe('src/lib/x.ts:41');
    expect(hits[0].side).toBe('+');
  });

  /** 砍掉一整個功能，政策那一節就開始說謊。只看新增的行會整個錯過這種。 */
  it('刪掉的行也命中', () => {
    const diff = diffOf('src/lib/x.ts', ['-await fetch(GEMINI_URL);']);
    const hits = hitsInDiff(diff);
    expect(hits).toHaveLength(1);
    expect(hits[0].side).toBe('-');
  });

  it('檔名裡有訊號不算命中，只有內容算', () => {
    expect(hitsInDiff(diffOf('ios/App/App/KeychainPlugin.swift', ['+import Foundation']))).toEqual([]);
  });

  /**
   * 整支檔被刪掉時 git 的新檔名寫成 `/dev/null`，座標只能落在舊檔名上。
   * 這是「把整個功能砍掉」的極端版——政策那一節整段開始說謊，最該擋的就是這一種。
   */
  it('整支檔被刪掉，命中算在舊檔名上', () => {
    const diff = [
      'diff --git a/src/lib/gemini-key.ts b/src/lib/gemini-key.ts',
      'deleted file mode 100644',
      '--- a/src/lib/gemini-key.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const KEY = "x";',
      '-export const read = () => localStorage.getItem(KEY);',
    ].join('\n');
    const hits = hitsInDiff(diff);
    expect(hits).toHaveLength(1);
    expect(`${hits[0].side} ${hits[0].file}:${hits[0].line}`).toBe('- src/lib/gemini-key.ts:2');
  });

  /**
   * 內文行本身可能長得像檔頭：刪掉一行 `-- 註解` 在 diff 裡就是 `--- 註解`。
   * 把它當檔頭跳過的話，後面每一行的行號都會少一，而 `+++` 那側更糟——會把座標換到一個不存在的檔上。
   */
  it('長得像檔頭的內文行不會被誤認', () => {
    const diff = diffOf('src/lib/x.ts', ['--- 這行只是被刪掉的註解', '-await fetch(url);']);
    const hits = hitsInDiff(diff);
    expect(hits).toHaveLength(1);
    expect(hits[0].line, '前面那行被當成檔頭跳過的話，行號會少一').toBe(2);
  });
});

describe('該不該擋', () => {
  const hitting = diffOf('src/lib/x.ts', ['+localStorage.setItem(K, v);']);

  it('命中、沒改 privacy、message 沒寫標記 → 擋', () => {
    expect(blockingHits(hitting, 'feat: 換個地方存').length).toBeGreaterThan(0);
  });

  it('message 寫了 Privacy-checked: → 放行', () => {
    expect(blockingHits(hitting, 'feat: 換個地方存\n\nPrivacy-checked: 只是搬個函式，行為沒變')).toEqual([]);
  });

  it('標記後面沒寫理由不算數', () => {
    expect(blockingHits(hitting, 'feat: 換個地方存\n\nPrivacy-checked:').length).toBeGreaterThan(0);
  });

  it('被 git 註解掉的那行標記不算數', () => {
    expect(blockingHits(hitting, 'feat: x\n# Privacy-checked: 這行是註解').length).toBeGreaterThan(0);
  });

  it('同時改了任一份 privacy → 放行', () => {
    const withPage = `${hitting}\n${diffOf('public/privacy-en.html', ['+<p>Now stored in the Keychain.</p>'])}`;
    expect(blockingHits(withPage, 'feat: 換個地方存')).toEqual([]);
  });

  it('完全不含訊號 → 放行', () => {
    expect(blockingHits(diffOf('src/ui/list-view.ts', ["+btn.textContent = '刪除';"]), 'fix: 文案')).toEqual([]);
  });
});

/**
 * 考題。`2b96a9a`（`ios-app 06`，密碼改存 Keychain）讓兩份 privacy 裡三句話失準，
 * 而當時沒有任何東西攔下它。這一條抓不到，就代表這整張票沒解決它要解決的問題。
 *
 * 初版計畫是盯死四支檔（`cloud-backup.ts`、`cloud-crypto.ts`、`gemini-key.ts`、`gemini-reading.ts`），
 * 那個做法在這一題上必定失敗——`keychain-native.ts` 那時候還不存在，不在任何清單裡。
 * 所以下面除了「有沒有擋」，還釘住「命中的是那四支以外的檔」，免得日後有人把做法改回按檔名。
 */
describe('考題：重放 2b96a9a', () => {
  const diff = execFileSync('git', ['show', '2b96a9a'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const OLD_LIST = ['cloud-backup.ts', 'cloud-crypto.ts', 'gemini-key.ts', 'gemini-reading.ts'];

  it('要擋下來', () => {
    const hits = blockingHits(diff, 'feat: 雲端備份的密碼改存 iOS Keychain，換裝置自動帶走（ios-app 06）');
    expect(hits.length, '這次是真的漏過的，抓不到代表這張票沒解決問題').toBeGreaterThan(0);
  });

  it('命中的檔不在初版那份四支檔清單裡', () => {
    const files = [...new Set(hitsInDiff(diff).map((hit) => hit.file))];
    expect(files.some((file) => !OLD_LIST.some((old) => file.endsWith(old)))).toBe(true);
  });
});
